/**
 * Metadata validation (reconcile) and graph-level enrichment.
 * Reconcile operates on the final CodeMeta JSON-LD output.
 * Enrich operates on the RDF graph before serialization.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import type { CodeMetaGraph } from './graph.js'
import type { CodeMeta } from './types.js'
import type { ValidationWarning } from './validate.js'
import { INTERFACE_CLUES, INTERFACE_CLUES_DEPS } from './constants.js'
import { codemeta, schema } from './graph.js'

/**
 * Ensure a value is an array.
 */
function toArray<T>(value: T | T[] | undefined): T[] {
	if (is.nullOrUndefined(value)) return []
	return is.array(value) ? value : [value]
}

/**
 * Reconcile conflicts and validate required fields.
 * Operates on the final JSON-LD output.
 */
export function reconcile(meta: Partial<CodeMeta>): ValidationWarning[] {
	const warnings: ValidationWarning[] = []

	if (!meta.codeRepository) {
		warnings.push({
			message: 'codeRepository not set',
			property: 'codeRepository',
			severity: 'warn',
		})
	}

	if (!meta.author || (is.array(meta.author) && meta.author.length === 0)) {
		warnings.push({
			message: 'author not set',
			property: 'author',
			severity: 'warn',
		})
	}

	if (!meta.license) {
		warnings.push({
			message: 'license not set',
			property: 'license',
			severity: 'warn',
		})
	}

	if (meta.license) {
		reconcileLicenses(meta, warnings)
	}

	return warnings
}

/**
 * Check for license conflicts and fix them.
 */
function reconcileLicenses(meta: Partial<CodeMeta>, warnings: ValidationWarning[]): void {
	const licenses: string[] = toArray(meta.license).filter((l): l is string => is.string(l))

	const hasGpl3Only = licenses.includes('http://spdx.org/licenses/GPL-3.0-only')
	const hasGpl3OrLater = licenses.includes('http://spdx.org/licenses/GPL-3.0-or-later')
	const hasGpl2OrLater = licenses.includes('http://spdx.org/licenses/GPL-2.0-or-later')

	if ((hasGpl3Only || hasGpl3OrLater) && hasGpl2OrLater) {
		warnings.push({
			message: 'License conflict: GPL-3.0 and GPL-2.0-or-later found. Removing GPL-2.0-or-later.',
			property: 'license',
			severity: 'warn',
		})
		const filtered = licenses.filter(
			(license) => license !== 'http://spdx.org/licenses/GPL-2.0-or-later',
		)
		meta.license = filtered.length === 1 ? filtered[0] : filtered
	}

	const hasGpl = licenses.some(
		(license) =>
			license.includes('spdx.org/licenses/GPL-') || license.includes('spdx.org/licenses/AGPL-'),
	)
	const hasNonGpl = licenses.some(
		(license) =>
			license.includes('spdx.org/licenses/') &&
			!license.includes('spdx.org/licenses/GPL-') &&
			!license.includes('spdx.org/licenses/AGPL-') &&
			!license.includes('spdx.org/licenses/LGPL-'),
	)
	if (hasGpl && hasNonGpl) {
		warnings.push({
			message: 'License conflict: GPL alongside non-GPL licenses detected',
			property: 'license',
			severity: 'warn',
		})
	}
}

/**
 * Enrich the RDF graph with auto-inferred values.
 * Operates directly on the graph before serialization.
 */
export function enrichGraph(graph: CodeMetaGraph, subject: NamedNode): void {
	enrichProgrammingLanguage(graph, subject)
	enrichRuntimePlatform(graph, subject)
	enrichContributors(graph, subject)
	enrichMaintainer(graph, subject)
	guessInterfaceType(graph, subject)
}

/**
 * Infer programming language from runtimePlatform.
 */
function enrichProgrammingLanguage(graph: CodeMetaGraph, subject: NamedNode): void {
	if (graph.hasProperty(subject, schema('programmingLanguage'))) return

	const platforms = graph.getValues(subject, schema('runtimePlatform'))
	if (platforms.length === 0) return

	for (const platform of platforms) {
		for (const language of ['Python', 'Perl', 'Ruby', 'Julia', 'PHP']) {
			if (platform.toLowerCase().startsWith(language.toLowerCase())) {
				graph.addString(subject, schema('programmingLanguage'), language)
			}
		}
	}
}

/**
 * Infer runtimePlatform from programmingLanguage.
 */
function enrichRuntimePlatform(graph: CodeMetaGraph, subject: NamedNode): void {
	if (graph.hasProperty(subject, schema('runtimePlatform'))) return

	const languages = graph.getValues(subject, schema('programmingLanguage'))
	if (languages.length === 0) return

	const platformMap: Record<string, string> = {
		elixir: 'Erlang',
		groovy: 'Java',
		java: 'Java',
		julia: 'Julia',
		kotlin: 'Java',
		perl: 'Perl',
		php: 'PHP',
		python: 'Python',
		ruby: 'Ruby',
	}

	for (const language of languages) {
		const platform = platformMap[language.toLowerCase().trim()]
		if (platform) {
			graph.addString(subject, schema('runtimePlatform'), platform)
		}
	}
}

/**
 * Add authors as contributors if contributors are missing.
 */
function enrichContributors(graph: CodeMetaGraph, subject: NamedNode): void {
	if (graph.hasProperty(subject, schema('contributor'))) return

	const authorQuads = graph.store.getQuads(subject, schema('author'), null, null)
	if (authorQuads.length === 0) return

	for (const q of authorQuads) {
		graph.add(subject, schema('contributor'), q.object as NamedNode)
	}
}

/**
 * First author as maintainer if no maintainer.
 */
function enrichMaintainer(graph: CodeMetaGraph, subject: NamedNode): void {
	if (graph.hasProperty(subject, codemeta('maintainer'))) return

	const authorQuads = graph.store.getQuads(subject, schema('author'), null, null)
	if (authorQuads.length === 0) return

	const firstAuthor = authorQuads[0].object as NamedNode

	// Check if the author has an invalid email
	const emails = graph.getValues(firstAuthor, schema('email'))
	const hasInvalidEmail = emails.some(
		(email) =>
			email.toLowerCase().includes('unknown') ||
			email.toLowerCase().includes('noreply') ||
			email.toLowerCase().includes('no-reply'),
	)

	if (!hasInvalidEmail) {
		graph.add(subject, codemeta('maintainer'), firstAuthor)
	}
}

/**
 * Guess the interface type from keywords, description, and dependencies.
 */
function guessInterfaceType(graph: CodeMetaGraph, subject: NamedNode): void {
	if (graph.hasProperty(subject, schema('applicationCategory'))) return

	const counter = new Map<string, number>()

	// Check keywords
	const keywords = graph.getValues(subject, schema('keywords'))
	for (const [clue, interfaceType] of INTERFACE_CLUES) {
		for (const keyword of keywords) {
			if (keyword.toLowerCase().includes(clue)) {
				counter.set(interfaceType, (counter.get(interfaceType) ?? 0) + 1)
			}
		}
	}

	// Check description
	const descriptions = graph.getValues(subject, schema('description'))
	for (const description of descriptions) {
		const lower = description.toLowerCase()
		for (const [clue, interfaceType] of INTERFACE_CLUES) {
			if (lower.includes(clue)) {
				counter.set(interfaceType, (counter.get(interfaceType) ?? 0) + 1)
			}
		}
	}

	// Check dependencies — look at softwareRequirements blank nodes
	const depQuads = graph.store.getQuads(subject, schema('softwareRequirements'), null, null)
	for (const q of depQuads) {
		const depNames = graph.getValues(q.object as NamedNode, schema('name'))
		for (const depName of depNames) {
			const lower = depName.toLowerCase()
			if (lower in INTERFACE_CLUES_DEPS) {
				const interfaceType = INTERFACE_CLUES_DEPS[lower]
				counter.set(interfaceType, (counter.get(interfaceType) ?? 0) + 1)
			}
		}
	}

	// Pick the most-voted interface type
	if (counter.size > 0) {
		let maxType = ''
		let maxCount = 0
		for (const [type, count] of counter) {
			if (count > maxCount) {
				maxType = type
				maxCount = count
			}
		}

		if (maxType) {
			graph.addString(subject, schema('applicationCategory'), maxType)
		}
	}
}
