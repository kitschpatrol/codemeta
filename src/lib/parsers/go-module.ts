/**
 * Go.mod parser.
 * Emits CodeMeta RDF triples from Go module files.
 *
 * Extracts module identity, Go version, direct dependencies, tool
 * dependencies, and applies replace directives. Since no crosswalk
 * mapping exists for go.mod, this parser defines its own field-to-property
 * mapping inline.
 */

import type { NamedNode } from 'n3'
import { readFileSync } from 'node:fs'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { COMMON_SOURCEREPOS } from '../constants.js'
import { codemeta, schema } from '../graph.js'

type BlockState = 'none' | 'replace' | 'require' | 'skip' | 'tool'

type Replacement = 'local' | { module: string; version: string }

/**
 * Known source-repo hosts and the number of path segments that make a repo URL.
 * e.g. github.com/owner/repo → 3 segments, git.sr.ht/~user/repo → 3 segments.
 */
const HOST_SEGMENTS: Record<string, number> = {
	'bitbucket.com': 3,
	'bitbucket.org': 3,
	'codeberg.org': 3,
	'git.sr.ht': 3,
	'github.com': 3,
	'gitlab.com': 3,
}

/**
 * Derive a repository URL from a Go module path, if it belongs to a
 * known source-code host. Strips `/vN` major-version suffixes.
 */
function moduleToRepoUrl(modulePath: string): string | undefined {
	const segments = modulePath.split('/')
	const host = segments[0]
	if (!host) return undefined

	const needed = HOST_SEGMENTS[host]
	if (!needed || segments.length < needed) return undefined

	// Take exactly the host-specific number of segments
	let repoPath = segments.slice(0, needed).join('/')

	// Strip /vN major-version suffix (e.g. github.com/foo/bar/v2 → github.com/foo/bar)
	repoPath = repoPath.replace(/\/v\d+$/, '')

	return `https://${repoPath}`
}

/** Strip inline comments and trim whitespace from a line. */
function stripComment(line: string): string {
	const index = line.indexOf('//')
	return index === -1 ? line.trim() : line.slice(0, index).trim()
}

/** Check whether a line has an `// indirect` comment. */
function isIndirect(line: string): boolean {
	return /\/\/\s*indirect/.test(line)
}

/**
 * Parse a require-style line: `module version [// indirect]`
 * Returns module path and version, or undefined if the line doesn't match.
 */
function parseRequireLine(
	line: string,
): undefined | { indirect: boolean; module: string; version: string } {
	const indirect = isIndirect(line)
	const clean = stripComment(line)
	const match = /^(\S+)\s+(\S+)/.exec(clean)
	if (!match) return undefined
	// Strip +incompatible suffix from version for cleaner output
	const version = match[2].replace(/\+incompatible$/, '')
	return { indirect, module: match[1], version }
}

/**
 * Parse a replace-style line: `old [version] => new version` or `old [version] => ./local`
 */
function parseReplaceLine(line: string): undefined | { from: string; to: Replacement } {
	const clean = stripComment(line)
	const parts = clean.split('=>')
	if (parts.length !== 2) return undefined

	const left = parts[0].trim().split(/\s+/)
	const right = parts[1].trim().split(/\s+/)

	const from = left[0]
	if (!from || right.length === 0) return undefined

	const target = right[0]
	if (!target) return undefined

	// Detect local path replacements
	if (target.startsWith('./') || target.startsWith('../') || target.startsWith('/')) {
		return { from, to: 'local' }
	}

	const version = right[1] ?? ''
	return { from, to: { module: target, version: version.replace(/\+incompatible$/, '') } }
}

/** Parse a tool-style line: just a module path. */
function parseToolLine(line: string): string | undefined {
	const clean = stripComment(line).trim()
	if (clean.length === 0) return undefined
	// Tool lines are just a module path, possibly with subpackage
	return clean.split(/\s+/)[0] || undefined
}

/**
 * Parse a go.mod file and emit triples into the graph.
 */
export async function parseGoModule(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const lines = content.split('\n')
	const warnings: string[] = []

	let modulePath: string | undefined
	let goVersion: string | undefined
	const directDeps: Record<string, string> = {}
	const toolDeps: string[] = []
	const replacements = new Map<string, Replacement>()

	let blockState: BlockState = 'none'

	for (const rawLine of lines) {
		const line = rawLine.trim()

		// Skip empty lines and pure comments
		if (line === '' || (line.startsWith('//') && blockState === 'none')) continue

		// Handle block close
		if (line === ')' || line.startsWith(')')) {
			blockState = 'none'
			continue
		}

		// Inside a block
		if (blockState !== 'none') {
			switch (blockState) {
				case 'replace': {
					const rep = parseReplaceLine(line)
					if (rep) {
						replacements.set(rep.from, rep.to)
					}

					break
				}

				case 'require': {
					const dep = parseRequireLine(line)
					if (dep && !dep.indirect) {
						directDeps[dep.module] = dep.version
					}

					break
				}

				case 'skip': {
					// Exclude, retract, etc.
					break
				}

				case 'tool': {
					const tool = parseToolLine(line)
					if (tool) {
						toolDeps.push(tool)
					}

					break
				}
			}

			continue
		}

		// Top-level directives
		if (line.startsWith('module ')) {
			modulePath = line.slice('module '.length).trim()
		} else if (line.startsWith('go ')) {
			goVersion = line.slice('go '.length).trim()
		} else if (line.startsWith('require ')) {
			if (line.includes('(')) {
				blockState = 'require'
			} else {
				// Single-line require
				const dep = parseRequireLine(line.slice('require '.length))
				if (dep && !dep.indirect) {
					directDeps[dep.module] = dep.version
				}
			}
		} else if (line.startsWith('replace ')) {
			if (line.includes('(')) {
				blockState = 'replace'
			} else {
				const rep = parseReplaceLine(line.slice('replace '.length))
				if (rep) {
					replacements.set(rep.from, rep.to)
				}
			}
		} else if (line.startsWith('tool ')) {
			if (line.includes('(')) {
				blockState = 'tool'
			} else {
				const tool = parseToolLine(line.slice('tool '.length))
				if (tool) {
					toolDeps.push(tool)
				}
			}
		} else if (
			(line.startsWith('exclude ') ||
				line.startsWith('retract ') ||
				line.startsWith('godebug ') ||
				line.startsWith('toolchain ')) &&
			line.includes('(')
		) {
			blockState = 'skip'
		}

		// Single-line forms: just skip
	}

	// ─── Apply replacements to directDeps ─────────────────────────

	for (const [from, to] of replacements) {
		if (from in directDeps) {
			// eslint-disable-next-line ts/no-dynamic-delete -- cleaning up replaced deps
			delete directDeps[from]
			if (to !== 'local') {
				directDeps[to.module] = to.version
			}
		}
	}

	// ─── Emit triples ─────────────────────────────────────────────

	graph.setType(subject, schema('SoftwareSourceCode'))

	// Module → identifier
	if (modulePath) {
		graph.addString(subject, schema('identifier'), modulePath)

		// Module → codeRepository (if hosted on a known forge)
		const repoUrl = moduleToRepoUrl(modulePath)
		if (repoUrl) {
			for (const prefix of COMMON_SOURCEREPOS) {
				if (repoUrl.startsWith(prefix)) {
					graph.emitRepository(subject, repoUrl)
					break
				}
			}
		}
	}

	// ProgrammingLanguage = Go (inferred)
	graph.addString(subject, schema('programmingLanguage'), 'Go')

	// Go version → runtimePlatform
	if (goVersion) {
		graph.addString(subject, schema('runtimePlatform'), `Go ≥${goVersion}`)
	}

	// Direct deps → softwareRequirements
	if (Object.keys(directDeps).length > 0) {
		graph.emitDependencies(subject, schema('softwareRequirements'), directDeps, 'Go')
	}

	// Tool deps → softwareSuggestions
	if (toolDeps.length > 0) {
		const toolMap: Record<string, string> = {}
		for (const tool of toolDeps) {
			toolMap[tool] = ''
		}

		graph.emitDependencies(subject, codemeta('softwareSuggestions'), toolMap, 'Go')
	}

	return warnings
}
