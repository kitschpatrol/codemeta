/**
 * Python pyproject.toml parser (PEP 621 / Poetry).
 * Emits CodeMeta RDF triples from pyproject.toml files.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { readmeWebUrl } from '../constants.js'
import { codemeta, schema } from '../graph.js'
import { emitPythonDeps, parseClassifier, parseUrl } from './python-utils.js'

/**
 * Source fields that need parser-specific handling beyond what addPropertySmart
 * provides. These are skipped in the crosswalk loop and processed explicitly.
 */
const EXPLICIT_HANDLERS = new Set([
	'classifiers',
	'dependencies',
	'dev-dependencies',
	'license-expression',
	'optional-dependencies',
	'readme',
	'requires-python',
	'urls',
])

/**
 * Parse a pyproject.toml file and emit triples into the graph.
 */
export async function parsePyproject(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const data: Record<string, unknown> = parseToml(content)
	const warnings: string[] = []

	graph.setType(subject, schema('SoftwareSourceCode'))
	graph.addString(subject, schema('runtimePlatform'), 'Python 3')

	// Extract the project table (PEP 621) or poetry section
	let project: Record<string, unknown> | undefined
	if (is.plainObject(data.project) && 'name' in data.project) {
		project = data.project as Record<string, unknown>
	} else if (is.plainObject(data.tool) && is.plainObject(data.tool.poetry)) {
		project = data.tool.poetry as Record<string, unknown>
	}

	if (!project) {
		warnings.push('No [project] or [tool.poetry] section found in pyproject.toml')
		return warnings
	}

	const metaMap = crosswalk.maps['Python PEP 621']

	// Phase 1: Crosswalk-driven mapping
	for (const key of Object.keys(metaMap)) {
		if (EXPLICIT_HANDLERS.has(key)) continue
		const value = project[key]

		if (!is.nullOrUndefined(value) && !is.emptyStringOrWhitespace(value)) {
			graph.addPropertySmart(subject, metaMap[key as keyof typeof metaMap], value)
		}
	}

	// Phase 2: Explicit handlers for fields requiring parser-specific logic

	// Classifiers — development status, programming language, audience, etc.
	// Classifiers use the Distutils crosswalk since the classifier keys are the same
	const classifierMap = crosswalk.maps['Python Distutils (PyPI)']
	if (is.array(project.classifiers, is.string)) {
		for (const classifier of project.classifiers) {
			parseClassifier(classifier, classifierMap, graph, subject)
		}
	}

	// URLs table — label-based routing to various properties
	if (is.plainObject(project.urls)) {
		for (const [label, url] of Object.entries(project.urls as Record<string, unknown>)) {
			if (is.string(url)) {
				parseUrl(label, url, graph, subject)
			}
		}
	}

	// Poetry-specific top-level URL fields (not in a [project.urls] table)
	for (const field of ['homepage', 'repository', 'documentation', 'changelog']) {
		const url = project[field]
		if (is.string(url)) {
			parseUrl(field, url, graph, subject)
		}
	}

	// Requires-python — override the default "Python 3" runtimePlatform
	if (is.string(project['requires-python'])) {
		graph.removeProperty(subject, schema('runtimePlatform'))
		graph.addString(subject, schema('runtimePlatform'), `Python ${project['requires-python']}`)
	}

	// Dependencies — PEP 621 string arrays or Poetry-style objects
	emitPythonDeps(project.dependencies, schema('softwareRequirements'), graph, subject)

	// Dev dependencies (Poetry format: string array or object)
	emitPythonDeps(project['dev-dependencies'], codemeta('softwareSuggestions'), graph, subject)

	// Optional dependencies — dict of string arrays, all emitted as softwareSuggestions
	if (is.plainObject(project['optional-dependencies'])) {
		for (const deps of Object.values(project['optional-dependencies'] as Record<string, unknown>)) {
			emitPythonDeps(deps, codemeta('softwareSuggestions'), graph, subject)
		}
	}

	// Readme — prefer web URL, fall back to filename
	if (is.string(project.readme)) {
		if (project.readme.startsWith('http')) {
			graph.addUrl(subject, codemeta('readme'), project.readme)
		} else {
			const repos = graph.getValues(subject, schema('codeRepository'))
			const url = repos.length > 0 ? readmeWebUrl(repos[0], project.readme) : undefined
			if (url) {
				graph.addUrl(subject, codemeta('readme'), url)
			} else {
				graph.addString(subject, codemeta('readme'), project.readme)
			}
		}
	}

	// License-expression (PEP 639)
	if (is.string(project['license-expression'])) {
		graph.emitLicense(subject, project['license-expression'])
	}

	return warnings
}
