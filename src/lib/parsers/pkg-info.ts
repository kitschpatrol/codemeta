/**
 * Python PKG-INFO / METADATA parser.
 * Emits CodeMeta RDF triples from PKG-INFO or METADATA files
 * (RFC 822-style email headers used in .egg-info and .dist-info).
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { schema } from '../graph.js'
import { depsToMap, parseClassifier, parseUrl } from './python-utils.js'

/**
 * Multi-value headers that can appear multiple times.
 */
const MULTI_VALUE_HEADERS = new Set([
	'Classifier',
	'Platform',
	'Project-URL',
	'Requires-Dist',
	'Requires-External',
	'Supported-Platform',
])

/**
 * Headers handled explicitly (not via crosswalk loop).
 */
const EXPLICIT_HANDLERS = new Set(['Classifier', 'Project-URL', 'Requires-Dist', 'Requires-Python'])

/**
 * Parse RFC 822-style headers from PKG-INFO / METADATA content.
 * Returns a map of header names to values. Multi-value headers are
 * collected into newline-separated strings.
 * Stops at the first blank line (which separates headers from the body).
 */
function parseHeaders(content: string): Record<string, string> {
	const headers: Record<string, string> = {}
	const lines = content.split('\n')
	let lastKey = ''

	for (const line of lines) {
		// Blank line = end of headers, start of body
		if (line.trim() === '') break

		// Continuation line (starts with whitespace)
		if (/^\s/.test(line) && lastKey) {
			const continuation = line.trim()
			if (continuation) {
				headers[lastKey] = `${headers[lastKey]}\n${continuation}`
			}

			continue
		}

		// Header line: "Key: Value"
		const colonIndex = line.indexOf(': ')
		if (colonIndex > 0) {
			const key = line.slice(0, colonIndex)
			const value = line.slice(colonIndex + 2).trim()

			headers[key] =
				MULTI_VALUE_HEADERS.has(key) && headers[key] ? `${headers[key]}\n${value}` : value

			lastKey = key
		}
	}

	return headers
}

/**
 * Parse a PKG-INFO or METADATA file and emit triples into the graph.
 */
export async function parsePkgInfo(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const headers = parseHeaders(content)
	const warnings: string[] = []

	graph.setType(subject, schema('SoftwareSourceCode'))
	graph.addString(subject, schema('runtimePlatform'), 'Python 3')

	const metaMap = crosswalk.maps['Python PKG-INFO']

	// Phase 1: Crosswalk-driven mapping for simple headers
	for (const key of Object.keys(metaMap)) {
		if (EXPLICIT_HANDLERS.has(key)) continue
		const value = headers[key]

		if (is.nonEmptyStringAndNotWhitespace(value)) {
			graph.addPropertySmart(subject, metaMap[key as keyof typeof metaMap], value)
		}
	}

	// Phase 2: Explicit handlers

	// Classifiers — multi-value header
	if (headers.Classifier) {
		const classifierMap = crosswalk.maps['Python Distutils (PyPI)']
		for (const classifier of headers.Classifier.split('\n')) {
			if (classifier.trim()) {
				parseClassifier(classifier.trim(), classifierMap, graph, subject)
			}
		}
	}

	// Requires-Dist — multi-value dependency header
	if (headers['Requires-Dist']) {
		const deps = headers['Requires-Dist']
			.split('\n')
			.map((d) => d.trim())
			.filter((d) => d.length > 0)
		graph.emitDependencies(subject, schema('softwareRequirements'), depsToMap(deps), 'Python 3')
	}

	// Requires-Python — version constraint
	if (is.nonEmptyStringAndNotWhitespace(headers['Requires-Python'])) {
		graph.removeProperty(subject, schema('runtimePlatform'))
		graph.addString(subject, schema('runtimePlatform'), `Python ${headers['Requires-Python']}`)
	}

	// Project-URL — multi-value "Label, URL" format
	if (headers['Project-URL']) {
		for (const line of headers['Project-URL'].split('\n')) {
			const commaIndex = line.indexOf(', ')
			if (commaIndex > 0) {
				const label = line.slice(0, commaIndex).trim()
				const url = line.slice(commaIndex + 2).trim()
				if (url) {
					parseUrl(label, url, graph, subject)
				}
			}
		}
	}

	return warnings
}
