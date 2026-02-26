/**
 * Metadata file parser (metadata.json / metadata.yaml / metadata.yml).
 * Emits CodeMeta RDF triples from custom metadata files.
 *
 * This is a simple custom format with synonymous field names for common
 * project metadata. It supports JSON and YAML formats.
 *
 * Field mapping (with fallback chains):
 *   description                                           → schema:description
 *   homepage | url | repository (normalized) | website    → schema:url
 *   keywords | tags | topics                              → keywords
 *
 * Keywords may be an array of strings or a single comma-delimited string.
 *
 * Since metadata files have no official crosswalk definition, this parser
 * defines its own field-to-property mapping inline.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { schema } from '../graph.js'

/** Normalize a repository URL by stripping git+ prefix and .git suffix. */
function normalizeRepoUrl(url: string): string {
	let normalized = url
	if (normalized.startsWith('git+')) {
		normalized = normalized.slice(4)
	}
	if (normalized.endsWith('.git')) {
		normalized = normalized.slice(0, -4)
	}
	return normalized
}

/** Parse keywords from an array of strings or a comma-delimited string. */
function parseKeywords(value: unknown): string[] | undefined {
	if (is.string(value)) {
		const parsed = value
			.split(',')
			.map((k) => k.trim())
			.filter(Boolean)
		return parsed.length > 0 ? parsed : undefined
	}
	if (is.array(value)) {
		const strings = value.filter((v): v is string => is.string(v))
		return strings.length > 0 ? strings : undefined
	}
	return undefined
}

/**
 * Parse a metadata.json / metadata.yaml / metadata.yml file and emit triples.
 */
export async function parseMetadata(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const warnings: string[] = []

	let data: Record<string, unknown>
	const extension = extname(filePath).toLowerCase()

	try {
		data =
			extension === '.json'
				? (JSON.parse(content) as Record<string, unknown>)
				: (parseYaml(content) as Record<string, unknown>)
	} catch (error) {
		warnings.push(
			`Invalid metadata file: ${error instanceof Error ? error.message : String(error)}`,
		)
		return warnings
	}

	if (!is.plainObject(data)) {
		warnings.push('Invalid metadata file: not an object')
		return warnings
	}

	graph.setType(subject, schema('SoftwareSourceCode'))

	// ─── description ──────────────────────────────────────────────

	if (is.string(data.description)) {
		graph.addString(subject, schema('description'), data.description)
	}

	// ─── url: homepage > url > repository (normalized) > website ──

	const url =
		(is.string(data.homepage) ? data.homepage : undefined) ??
		(is.string(data.url) ? data.url : undefined) ??
		(is.string(data.repository) ? normalizeRepoUrl(data.repository) : undefined) ??
		(is.string(data.website) ? data.website : undefined)

	if (url) {
		graph.addUrl(subject, schema('url'), url)
	}

	// ─── keywords: keywords > tags > topics ───────────────────────

	const keywords =
		parseKeywords(data.keywords) ?? parseKeywords(data.tags) ?? parseKeywords(data.topics)

	if (keywords) {
		for (const keyword of keywords) {
			graph.addProperty(subject, 'keywords', keyword)
		}
	}

	return warnings
}
