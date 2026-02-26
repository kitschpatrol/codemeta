/* eslint-disable max-depth */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { CodeMetaBasic } from './types-basic.js'
import type { CodeMeta } from './types.js'
import { crosswalk } from './crosswalk.js'
import { discover } from './discover.js'
import { CodeMetaGraph, namedNode, schema } from './graph.js'
import { log } from './log.js'
import { enrichGraph, reconcile } from './merge.js'
import { findParser } from './parsers/index.js'
import { simplify } from './simplify.js'

const DEFAULT_SUBJECT = 'https://example.org/software'

/** Options for {@link generate} and {@link generateFromFiles}. */
export type GenerateOptions = {
	/** Base URI for the `@id` field. If not set, auto-detected from an input `codemeta.json` file's `@id`, or omitted from output. */
	baseUri?: string
	/** If `true`, return a simplified {@link CodeMetaBasic} object with predictable types, no JSON-LD boilerplate, and consistent singular/array shapes. */
	basic?: boolean
	/** If `true`, infer missing properties from existing metadata (e.g. derive `programmingLanguage` from `runtimePlatform`, copy `author` to `contributor`). */
	enrich?: boolean
	/** Glob patterns to exclude from automatic file discovery in directories. */
	exclude?: string[]
	/** Property values that override anything parsed from files. Keys are CodeMeta property names. */
	overrides?: Partial<CodeMeta>
	/** If `true`, scan subdirectories recursively when a path is a directory. */
	recursive?: boolean
	/** If `true`, include existing `codemeta.json` files as input even when primary metadata sources are present. By default, `codemeta.json` is excluded during directory discovery when primary sources exist, ensuring idempotent generation. */
	retain?: boolean
}

/** Default values for {@link GenerateOptions}. */
export const DEFAULT_GENERATE_OPTIONS: GenerateOptions = {
	baseUri: undefined,
	enrich: false,
	exclude: undefined,
	overrides: undefined,
	recursive: false,
	retain: false,
}

/**
 * Main entry point for generating CodeMeta metadata.
 *
 * Accepts one or more file or directory paths, discovers parseable metadata
 * files in directories, parses all sources, and merges them into a single
 * {@link CodeMeta} object. When multiple sources define the same property,
 * higher-priority sources (e.g. `package.json` at priority 10) override
 * lower-priority ones (e.g. `codemeta.json` at priority 0).
 * @param paths - One or more file or directory paths to scan.
 * @param options - Generation options (enrichment, exclusions, overrides, etc.).
 * @returns A composed CodeMeta JSON-LD object, or a simplified {@link CodeMetaBasic} if `basic` is set.
 */
export async function generate(
	paths: string | string[],
	options: GenerateOptions & { basic: true },
): Promise<CodeMetaBasic>
export async function generate(
	paths: string | string[],
	options?: GenerateOptions,
): Promise<CodeMeta>
export async function generate(
	paths: string | string[],
	options?: GenerateOptions,
): Promise<CodeMeta | CodeMetaBasic> {
	const resolvedOptions = { ...DEFAULT_GENERATE_OPTIONS, ...options }

	const pathsArray = is.array(paths) ? paths : [paths]
	const filesToParse: Array<{ filePath: string; priority: number }> = []
	const seenFiles = new Set<string>()

	for (const path of pathsArray) {
		const resolvedPath = resolve(path)
		if (!existsSync(resolvedPath)) {
			log.warn(`Path does not exist: ${path}`)
			continue
		}

		const stat = statSync(resolvedPath)
		if (stat.isDirectory()) {
			const discovered = await discover(
				resolvedPath,
				resolvedOptions.recursive,
				resolvedOptions.exclude,
				resolvedOptions.retain,
			)

			for (const file of discovered) {
				const absolutePath = resolve(file.filePath)
				if (!seenFiles.has(absolutePath)) {
					filesToParse.push({ filePath: absolutePath, priority: file.priority })
					seenFiles.add(absolutePath)
				}
			}
		} else if (stat.isFile()) {
			const entry = findParser(basename(resolvedPath))
			if (entry === undefined) {
				log.warn(`No parser found for file: ${path}`)
			} else if (!seenFiles.has(resolvedPath)) {
				filesToParse.push({ filePath: resolvedPath, priority: entry.priority })
				seenFiles.add(resolvedPath)
			}
		}
	}

	if (filesToParse.length === 0) {
		log.error('No metadata files discovered or provided in', pathsArray.join(', '))
	}

	// Sort by priority (lower = first = lower priority in merge)
	filesToParse.sort((a, b) => a.priority - b.priority)

	return generateFromFiles(
		filesToParse.map((f) => f.filePath),
		resolvedOptions,
	)
}

/**
 * Parse specific files and compose their metadata into a single {@link CodeMeta} object.
 *
 * Unlike {@link generate}, this function does not perform directory discovery —
 * it parses exactly the files provided. Files are processed in order, with
 * later files overriding earlier ones for singular properties. List properties
 * (e.g. `author`, `softwareRequirements`) are accumulated and deduplicated.
 * @param files - One or more file paths to parse.
 * @param options - Generation options (enrichment, overrides, etc.).
 * @returns A composed CodeMeta JSON-LD object, or a simplified {@link CodeMetaBasic} if `basic` is set.
 */
export async function generateFromFiles(
	files: string | string[],
	options: GenerateOptions & { basic: true },
): Promise<CodeMetaBasic>
export async function generateFromFiles(
	files: string | string[],
	options?: GenerateOptions,
): Promise<CodeMeta>
export async function generateFromFiles(
	files: string | string[],
	options?: GenerateOptions,
): Promise<CodeMeta | CodeMetaBasic> {
	const resolvedOptions = { ...DEFAULT_GENERATE_OPTIONS, ...options }

	const filesArray = is.array(files) ? files : [files]
	const graph = new CodeMetaGraph()
	const baseUri = resolvedOptions.baseUri ?? detectBaseUri(filesArray) ?? DEFAULT_SUBJECT
	const subject = namedNode(baseUri)
	graph.setType(subject, schema('SoftwareSourceCode'))

	for (const filePath of filesArray) {
		// Skip empty files (e.g. codemeta.json truncated by shell redirection)
		if (statSync(filePath).size === 0) {
			log.debug(`Skipping empty file: ${filePath}`)
			continue
		}

		log.debug(`Parsing: ${filePath}`)
		try {
			const entry = findParser(basename(filePath))
			if (!entry) {
				log.warn(`  No parser found for: ${filePath}`)
				continue
			}

			// Adds information from the file to the graph... accumulating and
			// returning warnings along the way
			const warnings = await entry.parser(filePath, graph, subject, crosswalk)
			for (const warning of warnings) {
				log.warn(warning)
			}
		} catch (error) {
			log.error(
				`Error parsing ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	// Apply user overrides
	if (resolvedOptions.overrides) {
		applyOverrides(graph, subject, resolvedOptions.overrides)
	}

	// Enrich (auto-inference) if opted in
	if (resolvedOptions.enrich) {
		enrichGraph(graph, subject)
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion
	const result = (await graph.toJsonLd(subject.value)) as CodeMeta

	// Deduplicate arrays of structurally identical objects (e.g. when both
	// codemeta.json and package.json emit the same author or dependency)
	deduplicateArrays(result)

	// Strip default @id — only include when explicitly set via baseUri or input file
	if (baseUri === DEFAULT_SUBJECT && result['@id'] === DEFAULT_SUBJECT) {
		delete result['@id']
	}

	// Reconcile conflicts
	const warnings = reconcile(result)
	for (const warning of warnings) {
		log.warn(warning.message)
	}

	if (resolvedOptions.basic) {
		return simplify(result)
	}

	return result
}

/**
 * Apply user overrides to the graph by emitting triples for each property.
 */
function applyOverrides(
	graph: CodeMetaGraph,
	subject: NamedNode,
	overrides: Partial<CodeMeta>,
): void {
	for (const [key, value] of Object.entries(overrides)) {
		if (key.startsWith('@')) continue
		if (key === 'type' || key === 'id') continue

		const predicate = graph.propertyToIri(key)
		if (!predicate) continue

		// Remove existing values for this property (override semantics)
		graph.removeProperty(subject, predicate)

		const values = is.array(value) ? value : [value]
		for (const v of values) {
			if (is.string(v)) {
				if (graph.isIriProperty(key)) {
					graph.addUrl(subject, predicate, v)
				} else {
					graph.addString(subject, predicate, v)
				}
			} else if (is.plainObject(v)) {
				// For complex objects (Person, Organization, etc.), serialize as string
				// The graph framing will handle reconstruction
				const type = v['@type']
				if (is.string(type) && (type === 'Person' || type === 'Organization')) {
					const node = graph.blank()
					graph.setType(node, schema(type))
					for (const [propKey, propValue] of Object.entries(v)) {
						if (propKey.startsWith('@')) continue
						if (is.string(propValue)) {
							graph.addString(node, schema(propKey), propValue)
						}
					}

					graph.add(subject, predicate, node)
				}
			}
		}
	}
}

/**
 * Scan files for an explicit \@id in a codemeta.json input.
 * Returns the first \@id found, or undefined.
 */
function detectBaseUri(files: string[]): string | undefined {
	for (const filePath of files) {
		const name = basename(filePath).toLowerCase()
		if (name.endsWith('.json') && name.includes('codemeta')) {
			try {
				// eslint-disable-next-line ts/no-unsafe-type-assertion
				const data = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
				if (is.string(data['@id'])) {
					return data['@id']
				}
			} catch {
				// Ignore parse errors — the parser will handle them
			}
		}
	}

	return undefined
}

/**
 * Recursively deduplicate arrays of objects by structural equality.
 * Removes duplicate entries where all keys and values are identical,
 * which commonly arise when multiple parsers emit the same entity
 * (e.g. codemeta.json + package.json both describing the same author).
 */
function deduplicateArrays(object: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(object)) {
		if (!is.array(value)) continue

		const seen = new Set<string>()
		const unique: unknown[] = []
		for (const item of value) {
			const serialized = JSON.stringify(item)
			if (seen.has(serialized)) continue
			seen.add(serialized)
			unique.push(item)
		}

		object[key] = unique.length === 1 ? unique[0] : unique
	}
}
