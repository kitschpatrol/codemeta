/**
 * Shared utilities for Python metadata parsers.
 * Used by pyproject.toml, setup.cfg, PKG-INFO, and setup.py parsers.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import type { CodeMetaGraph } from '../graph.js'
import { parseCrosswalkKey } from '../crosswalk.js'
import { codemeta, schema } from '../graph.js'
import { statusToRepostatus } from '../normalize.js'

/**
 * Parse a Python classifier string and emit the appropriate triple.
 * Classifiers follow the format: "Category :: Subcategory :: Detail"
 */
export function parseClassifier(
	value: string,
	metaMap: Record<string, string>,
	graph: CodeMetaGraph,
	subject: NamedNode,
): void {
	const fields = value
		.trim()
		.split('::')
		.map((field) => field.trim())
	const classifier = fields[0]

	// Look up the classifier prefix in the crosswalk
	const classifierKey = `classifiers['${classifier}']`
	const prefixedProperty = metaMap[classifierKey]

	if (prefixedProperty) {
		const parsed = parseCrosswalkKey(prefixedProperty)
		if (!parsed) return
		const { property } = parsed

		const separator = property === 'programmingLanguage' ? ' ' : ' > '
		const classValue = fields.slice(1).join(separator)

		switch (property) {
			case 'developmentStatus': {
				const repostatus = statusToRepostatus(classValue)
				if (repostatus) {
					graph.addUrl(subject, codemeta('developmentStatus'), repostatus)
				}

				break
			}
			case 'license': {
				// Skip license classifiers — license is handled from the direct field
				break
			}
			case 'programmingLanguage': {
				graph.addString(subject, schema('runtimePlatform'), classValue)
				break
			}
			default: {
				// ApplicationCategory, operatingSystem, etc.
				const iri = graph.propertyToIri(property)
				if (iri) graph.addString(subject, iri, classValue)
			}
		}
	} else if (classifier === 'Intended Audience') {
		const audienceNode = graph.blank()
		graph.setType(audienceNode, schema('Audience'))
		graph.addString(audienceNode, schema('audienceType'), fields.slice(1).join(' > '))
		graph.add(subject, schema('audience'), audienceNode)
	}
}

/**
 * Parse a URL label and emit the appropriate triple.
 * Used for pyproject.toml [project.urls] and setup.cfg [options.project_urls].
 */
export function parseUrl(
	label: string,
	url: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
): void {
	const lowerLabel = label.toLowerCase()
	if (
		lowerLabel.includes('repository') ||
		['code', 'git', 'github', 'source', 'sourcecode'].includes(lowerLabel)
	) {
		graph.addUrl(subject, schema('codeRepository'), url)
	} else if (['bug tracker', 'issues', 'issue tracker', 'tracker'].includes(lowerLabel)) {
		graph.addUrl(subject, codemeta('issueTracker'), url)
	} else if (['api reference', 'docs', 'documentation', 'reference'].includes(lowerLabel)) {
		graph.addString(subject, schema('softwareHelp'), url)
	} else if (lowerLabel === 'readme') {
		if (url.startsWith('http')) {
			graph.addUrl(subject, codemeta('readme'), url)
		}
	} else if (['build', 'build instructions', 'installation'].includes(lowerLabel)) {
		graph.addUrl(subject, codemeta('buildInstructions'), url)
	} else if (['release notes', 'releases'].includes(lowerLabel)) {
		graph.addUrl(subject, schema('releaseNotes'), url)
	} else if (['ci', 'continuous integration', 'tests'].includes(lowerLabel)) {
		graph.addUrl(subject, codemeta('continuousIntegration'), url)
	} else if (lowerLabel.includes('homepage') || lowerLabel === 'home') {
		graph.addUrl(subject, schema('url'), url)
	} else {
		graph.addUrl(subject, schema('url'), url)
	}
}

/**
 * Parse a PEP 508 dependency string into name and version.
 * Handles formats like "requests>=2.0", "click", "package[extra]>=1.0;python_version>='3.8'"
 */
function parseDependency(input: string): {
	name: string
	version: string
} {
	const endMatch = /[\s;>=<!~^{[]/.exec(input)
	const end = endMatch ? endMatch.index : input.length
	const name = input.slice(0, end).trim()

	if (end >= input.length) return { name, version: '' }

	const rest = input.slice(end).trim()
	let version = ''

	// Skip extras like [dev,test]
	let restAfterExtras = rest
	if (rest.startsWith('[')) {
		const closeBracket = rest.indexOf(']')
		if (closeBracket !== -1) {
			restAfterExtras = rest.slice(closeBracket + 1).trim()
		}
	}

	if (restAfterExtras.startsWith('{')) {
		const versionMatch = /version\s*[=:]\s*["']([^"']+)["']/.exec(restAfterExtras)
		if (versionMatch) {
			version = versionMatch[1]
		}
	} else {
		const versionStart = restAfterExtras.search(/[^\s>=<!~^]/)
		if (versionStart !== -1) {
			const operator = restAfterExtras.slice(0, versionStart).trim()
			version = restAfterExtras.slice(versionStart).split(';')[0].trim()
			if (operator && operator !== '==' && operator !== '=') {
				version = `${operator} ${version}`
			}
		}
	}

	return { name, version: version.replaceAll(/[[\]()]/g, '').trim() }
}

/**
 * Convert a Python dependency string array to a { name: version } map
 * suitable for graph.emitDependencies().
 */
export function depsToMap(deps: string[]): Record<string, string> {
	const map: Record<string, string> = {}
	for (const dep of deps) {
		const { name, version } = parseDependency(dep)
		if (name) map[name] = version
	}

	return map
}

/**
 * Emit dependencies from either a PEP 621 string array or Poetry-style object.
 * Filters out "python" (which is the runtime version, not a real dependency).
 */
export function emitPythonDeps(
	value: unknown,
	predicate: NamedNode,
	graph: CodeMetaGraph,
	subject: NamedNode,
): void {
	if (is.array(value, is.string)) {
		// PEP 621 / setup.cfg / PKG-INFO: ["requests>=2.0", "click"]
		graph.emitDependencies(subject, predicate, depsToMap(value), 'Python 3')
	} else if (is.plainObject(value)) {
		// Poetry: { requests: "^2.0", click: { version: "^8.0" } }
		const depMap: Record<string, string> = {}
		for (const [name, version] of Object.entries(value as Record<string, unknown>)) {
			if (name === 'python') continue
			if (is.string(version)) {
				depMap[name] = version
			} else if (
				is.plainObject(version) &&
				is.string((version as Record<string, unknown>).version)
			) {
				depMap[name] = (version as Record<string, unknown>).version as string
			} else {
				depMap[name] = ''
			}
		}

		graph.emitDependencies(subject, predicate, depMap, 'Python 3')
	}
}
