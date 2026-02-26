/**
 * Python setup.cfg parser.
 * Emits CodeMeta RDF triples from setup.cfg files.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { codemeta, schema } from '../graph.js'
import { depsToMap, parseClassifier, parseUrl } from './python-utils.js'

/**
 * Source fields that need parser-specific handling beyond what addPropertySmart provides.
 */
const EXPLICIT_HANDLERS = new Set([
	'classifiers',
	'install_requires',
	'keywords',
	'long_description',
	'project_urls',
	'python_requires',
])

/**
 * Parse a setup.cfg INI-style file into sections with key-value pairs.
 * Handles Python ConfigParser conventions: multi-line values via indented continuation lines.
 */
function parseSetupCfgIni(content: string): Record<string, Record<string, string>> {
	const sections: Record<string, Record<string, string>> = {}
	let currentSection = ''

	const lines = content.split('\n')
	let lastKey = ''

	for (const line of lines) {
		const trimmed = line.trimEnd()

		// Skip empty lines and comments
		if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
			continue
		}

		// Section header
		const sectionMatch = /^\[([^\]]+)\]/.exec(trimmed)
		if (sectionMatch) {
			currentSection = sectionMatch[1]
			sections[currentSection] ??= {}
			lastKey = ''
			continue
		}

		// Continuation line (starts with whitespace and we have a current key)
		if (/^\s/.test(line) && lastKey && currentSection) {
			const existing = sections[currentSection][lastKey]
			const continuation = trimmed.trim()
			if (continuation) {
				sections[currentSection][lastKey] = existing ? `${existing}\n${continuation}` : continuation
			}

			continue
		}

		// Key = value pair
		const kvMatch = /^([^=:]+)[=:](.*)$/.exec(trimmed)
		if (kvMatch && currentSection) {
			const key = kvMatch[1].trim()
			const value = kvMatch[2].trim()
			sections[currentSection] ??= {}
			sections[currentSection][key] = value
			lastKey = key
		}
	}

	return sections
}

/**
 * Split a multi-line value into individual lines (for classifiers, install_requires, etc.)
 */
function splitMultiline(value: string): string[] {
	return value
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
}

/**
 * Parse a setup.cfg file and emit triples into the graph.
 */
export async function parseSetupCfg(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const sections = parseSetupCfgIni(content)
	const warnings: string[] = []

	graph.setType(subject, schema('SoftwareSourceCode'))
	graph.addString(subject, schema('runtimePlatform'), 'Python 3')

	const metadata = (sections.metadata as Record<string, string> | undefined) ?? {}
	const options = (sections.options as Record<string, string> | undefined) ?? {}

	const metaMap = crosswalk.maps['Python Distutils (PyPI)']

	// Phase 1: Crosswalk-driven mapping for [metadata] section
	for (const key of Object.keys(metaMap)) {
		if (EXPLICIT_HANDLERS.has(key)) continue
		// Skip classifier lookup keys (they're for parseClassifier, not direct fields)
		if (key.startsWith("classifiers['")) continue

		const value = metadata[key]
		if (is.nonEmptyStringAndNotWhitespace(value)) {
			graph.addPropertySmart(subject, metaMap[key as keyof typeof metaMap], value)
		}
	}

	// Phase 2: Explicit handlers

	// Classifiers — multi-line list in [metadata]
	if (is.nonEmptyStringAndNotWhitespace(metadata.classifiers)) {
		for (const classifier of splitMultiline(metadata.classifiers)) {
			parseClassifier(classifier, metaMap, graph, subject)
		}
	}

	// Keywords — comma-separated on a single line
	if (is.nonEmptyStringAndNotWhitespace(metadata.keywords)) {
		for (const keyword of metadata.keywords
			.split(',')
			.map((k) => k.trim())
			.filter(Boolean)) {
			graph.addString(subject, schema('keywords'), keyword)
		}
	}

	// Project URLs — multi-line "label = url" pairs in [metadata]
	if (is.nonEmptyStringAndNotWhitespace(metadata.project_urls)) {
		for (const line of splitMultiline(metadata.project_urls)) {
			const eqIndex = line.indexOf('=')
			if (eqIndex > 0) {
				const label = line.slice(0, eqIndex).trim()
				const url = line.slice(eqIndex + 1).trim()
				if (url) {
					parseUrl(label, url, graph, subject)
				}
			}
		}
	}

	// Install_requires — multi-line dependency list in [options]
	if (is.nonEmptyStringAndNotWhitespace(options.install_requires)) {
		const deps = splitMultiline(options.install_requires)
		graph.emitDependencies(subject, schema('softwareRequirements'), depsToMap(deps), 'Python 3')
	}

	// Python_requires — version constraint in [options]
	if (is.nonEmptyStringAndNotWhitespace(options.python_requires)) {
		graph.removeProperty(subject, schema('runtimePlatform'))
		graph.addString(subject, schema('runtimePlatform'), `Python ${options.python_requires}`)
	}

	// Extras_require — [options.extras_require] section → softwareSuggestions
	const extrasSection = sections['options.extras_require'] as Record<string, string> | undefined
	if (extrasSection) {
		for (const deps of Object.values(extrasSection)) {
			if (is.nonEmptyStringAndNotWhitespace(deps)) {
				const depList = splitMultiline(deps)
				graph.emitDependencies(
					subject,
					codemeta('softwareSuggestions'),
					depsToMap(depList),
					'Python 3',
				)
			}
		}
	}

	return warnings
}
