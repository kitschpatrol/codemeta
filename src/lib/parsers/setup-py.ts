/**
 * Python setup.py parser.
 * Emits CodeMeta RDF triples from setup.py files using tree-sitter AST parsing.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { codemeta, schema } from '../graph.js'
import { parseSetupPySource } from '../utilities/setup-py-parser.js'
import { depsToMap, parseClassifier, parseUrl } from './python-utils.js'

/**
 * Parse a setup.py file and emit triples into the graph.
 */
export async function parseSetupPy(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const data = parseSetupPySource(content)
	const warnings: string[] = []

	graph.setType(subject, schema('SoftwareSourceCode'))
	graph.addString(subject, schema('runtimePlatform'), 'Python 3')

	const metaMap = crosswalk.maps['Python Distutils (PyPI)']

	// Simple string fields via crosswalk
	const simpleFields: Array<{ crosswalkKey: string; dataKey: keyof typeof data }> = [
		{ crosswalkKey: 'name', dataKey: 'name' },
		{ crosswalkKey: 'version', dataKey: 'version' },
		{ crosswalkKey: 'description', dataKey: 'description' },
		{ crosswalkKey: 'long_description', dataKey: 'long_description' },
		{ crosswalkKey: 'author', dataKey: 'author' },
		{ crosswalkKey: 'author_email', dataKey: 'author_email' },
		{ crosswalkKey: 'maintainer', dataKey: 'maintainer' },
		{ crosswalkKey: 'maintainer_email', dataKey: 'maintainer_email' },
		{ crosswalkKey: 'url', dataKey: 'url' },
		{ crosswalkKey: 'download_url', dataKey: 'download_url' },
		{ crosswalkKey: 'license', dataKey: 'license' },
	]

	for (const { crosswalkKey, dataKey } of simpleFields) {
		const value = data[dataKey]
		const mapping = metaMap[crosswalkKey as keyof typeof metaMap]
		if (is.string(value) && is.nonEmptyStringAndNotWhitespace(value) && mapping) {
			graph.addPropertySmart(subject, mapping, value)
		}
	}

	// Keywords
	if (is.array(data.keywords) && data.keywords.length > 0) {
		for (const keyword of data.keywords) {
			graph.addString(subject, schema('keywords'), keyword)
		}
	}

	// Classifiers
	for (const classifier of data.classifiers) {
		parseClassifier(classifier, metaMap, graph, subject)
	}

	// Dependencies
	if (data.install_requires.length > 0) {
		graph.emitDependencies(
			subject,
			schema('softwareRequirements'),
			depsToMap(data.install_requires),
			'Python 3',
		)
	}

	// Python_requires
	if (is.nonEmptyStringAndNotWhitespace(data.python_requires)) {
		graph.removeProperty(subject, schema('runtimePlatform'))
		graph.addString(subject, schema('runtimePlatform'), `Python ${data.python_requires}`)
	}

	// Extras_require → softwareSuggestions
	for (const deps of Object.values(data.extras_require)) {
		if (deps.length > 0) {
			graph.emitDependencies(subject, codemeta('softwareSuggestions'), depsToMap(deps), 'Python 3')
		}
	}

	// Project_urls
	for (const [label, url] of Object.entries(data.project_urls)) {
		parseUrl(label, url, graph, subject)
	}

	return warnings
}
