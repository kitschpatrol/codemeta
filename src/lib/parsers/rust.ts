/**
 * Rust Cargo.toml parser.
 * Emits CodeMeta RDF triples from Cargo.toml files.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { get } from 'es-toolkit/compat'
import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { COMMON_SOURCEREPOS, readmeWebUrl } from '../constants.js'
import { codemeta, schema } from '../graph.js'

/**
 * Crosswalk keys that need parser-specific handling beyond what addPropertySmart
 * provides. These are skipped in the crosswalk loop and processed explicitly.
 */
const EXPLICIT_HANDLERS = new Set([
	// SoftwareHelp type is CreativeWork; addPropertySmart can't route it
	'package.documentation',
	// Readme needs web URL construction from codeRepository
	'package.readme',
])

/**
 * Parse a Cargo.toml file and emit triples into the graph.
 */
export async function parseRust(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const data: Record<string, unknown> = parseToml(content)
	const warnings: string[] = []

	graph.setType(subject, schema('SoftwareSourceCode'))

	const metaMap = crosswalk.maps['Rust Package Manager']

	// Phase 1: Crosswalk-driven mapping — uses full data paths (e.g. "package.name",
	// "dependencies") so get() resolves them against the root TOML structure
	for (const key of Object.keys(metaMap)) {
		if (EXPLICIT_HANDLERS.has(key)) continue
		const value = get(data, key)

		if (!is.nullOrUndefined(value) && !is.emptyStringOrWhitespace(value)) {
			graph.addPropertySmart(subject, metaMap[key as keyof typeof metaMap], value)
		}
	}

	// Phase 2: Explicit handlers for fields requiring parser-specific logic

	const pkg = (data.package ?? {}) as Record<string, unknown>

	// Documentation — emit as softwareHelp (crosswalk type CreativeWork doesn't route)
	if (is.string(pkg.documentation)) {
		graph.addUrl(subject, schema('softwareHelp'), pkg.documentation)
	}

	// Readme — prefer web URL, fall back to filename
	if (is.string(pkg.readme)) {
		if (pkg.readme.startsWith('http')) {
			graph.addUrl(subject, codemeta('readme'), pkg.readme)
		} else {
			const repos = graph.getValues(subject, schema('codeRepository'))
			const url = repos.length > 0 ? readmeWebUrl(repos[0], pkg.readme) : undefined
			if (url) {
				graph.addUrl(subject, codemeta('readme'), url)
			} else {
				graph.addString(subject, codemeta('readme'), pkg.readme)
			}
		}
	}

	// Homepage → codeRepository fallback (if repository isn't set and homepage
	// looks like a source repo). Homepage is already emitted as url via crosswalk.
	if (is.string(pkg.homepage) && !graph.hasProperty(subject, schema('codeRepository'))) {
		for (const sourceRepo of COMMON_SOURCEREPOS) {
			if (pkg.homepage.startsWith(sourceRepo)) {
				graph.addUrl(subject, schema('codeRepository'), pkg.homepage)
				break
			}
		}
	}

	// Set programming language
	graph.addString(subject, schema('programmingLanguage'), 'Rust')

	return warnings
}
