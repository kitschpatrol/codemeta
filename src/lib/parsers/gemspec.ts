/**
 * Ruby .gemspec parser.
 * Emits CodeMeta RDF triples from .gemspec files.
 *
 * Uses the tree-sitter-based gemspec parser utility to extract structured
 * data from .gemspec files without executing Ruby.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import type { GemSpecDependency } from '../utilities/gemspec-parser.js'
import { COMMON_SOURCEREPOS } from '../constants.js'
import { codemeta, schema } from '../graph.js'
import { createPerson, emitPerson } from '../person.js'
import { parseGemspec } from '../utilities/gemspec-parser.js'

/**
 * Convert a GemSpecDependency array to a Record<string, string> map
 * suitable for graph.emitDependencies().
 */
function dependenciesToMap(deps: GemSpecDependency[]): Record<string, string> {
	const result: Record<string, string> = {}
	for (const dep of deps) {
		result[dep.name] = dep.requirements.join(', ')
	}
	return result
}

/**
 * Parse a .gemspec file and emit triples into the graph.
 */
export async function parseGemspecFile(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const spec = parseGemspec(content)
	const warnings: string[] = []

	graph.setType(subject, schema('SoftwareSourceCode'))

	// ─── Name & identifier ────────────────────────────────────────────

	if (is.nonEmptyStringAndNotWhitespace(spec.name)) {
		graph.addString(subject, schema('name'), spec.name)
		const identifierIri = graph.propertyToIri('identifier')
		if (identifierIri) {
			graph.addString(subject, identifierIri, spec.name)
		}
	}

	// ─── Version ──────────────────────────────────────────────────────

	if (is.nonEmptyStringAndNotWhitespace(spec.version)) {
		graph.addString(subject, schema('version'), spec.version)
	}

	// ─── Description ──────────────────────────────────────────────────
	// Prefer description over summary (description is usually longer)

	if (is.nonEmptyStringAndNotWhitespace(spec.description)) {
		graph.addString(subject, schema('description'), spec.description.trim())
	} else if (is.nonEmptyStringAndNotWhitespace(spec.summary)) {
		graph.addString(subject, schema('description'), spec.summary.trim())
	}

	// ─── Homepage → codeRepository + url ──────────────────────────────
	// Per crosswalk: homepage → codeRepository
	// Also emit as url (like nodejs does)

	if (is.nonEmptyStringAndNotWhitespace(spec.homepage)) {
		graph.addUrl(subject, schema('url'), spec.homepage)
		for (const sourceRepo of COMMON_SOURCEREPOS) {
			if (spec.homepage.startsWith(sourceRepo)) {
				graph.emitRepository(subject, spec.homepage)
				break
			}
		}
	}

	// ─── License ──────────────────────────────────────────────────────

	if (is.nonEmptyStringAndNotWhitespace(spec.license)) {
		graph.emitLicense(subject, spec.license)
	}

	// Licenses (plural) — emit each one
	if (is.nonEmptyArray(spec.licenses)) {
		for (const license of spec.licenses) {
			if (is.nonEmptyStringAndNotWhitespace(license)) {
				graph.emitLicense(subject, license)
			}
		}
	}

	// ─── Authors + Email ──────────────────────────────────────────────
	// Ruby's spec.author= is an alias for spec.authors=, but the tree-sitter
	// parser stores singular `author` in extra. Merge both forms.

	const authors: string[] = [...spec.authors]
	const extraAuthor = spec.extra.author
	if (is.string(extraAuthor) && is.nonEmptyStringAndNotWhitespace(extraAuthor)) {
		authors.push(extraAuthor)
	} else if (is.array(extraAuthor)) {
		for (const a of extraAuthor) {
			if (is.string(a) && is.nonEmptyStringAndNotWhitespace(a)) {
				authors.push(a)
			}
		}
	}

	const emails = is.array(spec.email)
		? spec.email.filter((email) => is.nonEmptyStringAndNotWhitespace(email))
		: is.nonEmptyStringAndNotWhitespace(spec.email)
			? [spec.email]
			: []

	if (is.nonEmptyArray(authors)) {
		for (const [index, authorName] of authors.entries()) {
			if (!is.nonEmptyStringAndNotWhitespace(authorName)) continue
			const email = index < emails.length ? emails[index] : undefined
			const person = createPerson({
				email,
				name: authorName,
			})
			const node = emitPerson(person, graph)
			graph.add(subject, schema('author'), node)
		}

		// Emit any remaining emails that weren't paired with authors
		for (let i = authors.length; i < emails.length; i++) {
			const person = createPerson({ name: emails[i] })
			const node = emitPerson(person, graph)
			graph.add(subject, schema('author'), node)
		}
	} else if (emails.length > 0) {
		// No authors, but we have emails — emit as authors
		for (const email of emails) {
			const person = createPerson({ name: email })
			const node = emitPerson(person, graph)
			graph.add(subject, schema('author'), node)
		}
	}

	// ─── Platform → runtimePlatform ───────────────────────────────────

	if (is.nonEmptyStringAndNotWhitespace(spec.platform)) {
		graph.addString(subject, schema('runtimePlatform'), spec.platform)
	}

	// ─── Required Ruby version → runtimePlatform ─────────────────────

	if (is.nonEmptyStringAndNotWhitespace(spec.required_ruby_version)) {
		graph.addString(subject, schema('runtimePlatform'), `Ruby ${spec.required_ruby_version}`)
	}

	// ─── Runtime dependencies → softwareRequirements ──────────────────

	const runtimeDeps = spec.dependencies.filter((d) => d.type === 'runtime')
	if (runtimeDeps.length > 0) {
		graph.emitDependencies(subject, schema('softwareRequirements'), dependenciesToMap(runtimeDeps))
	}

	// ─── Development dependencies → softwareSuggestions ───────────────

	const devDeps = spec.dependencies.filter((d) => d.type === 'development')
	if (devDeps.length > 0) {
		graph.emitDependencies(subject, codemeta('softwareSuggestions'), dependenciesToMap(devDeps))
	}

	// ——— Programming language ─────────────────────────────────────────

	graph.addString(subject, schema('programmingLanguage'), 'Ruby')

	return warnings
}
