import { describe, expect, it } from 'vitest'
import type { CodeMeta } from '../src/lib/types.js'
import { codemeta, CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { enrichGraph, reconcile } from '../src/lib/merge.js'
import { emitPerson } from '../src/lib/person.js'

const SUBJECT = 'https://example.org/test'

describe('reconcile', () => {
	it('should warn about missing codeRepository', () => {
		const meta: Partial<CodeMeta> = { name: 'test' }
		const warnings = reconcile(meta)
		expect(warnings.some((warning) => warning.property === 'codeRepository')).toBe(true)
	})

	it('should warn about missing author', () => {
		const meta: Partial<CodeMeta> = { name: 'test' }
		const warnings = reconcile(meta)
		expect(warnings.some((warning) => warning.property === 'author')).toBe(true)
	})

	it('should fix GPL-3.0-only + GPL-2.0-or-later conflict', () => {
		const meta: Partial<CodeMeta> = {
			license: [
				'https://spdx.org/licenses/GPL-3.0-only',
				'https://spdx.org/licenses/GPL-2.0-or-later',
			],
		}
		const warnings = reconcile(meta)
		expect(
			warnings.some((warning) => warning.property === 'license' && warning.message.includes('GPL')),
		).toBe(true)
		expect(meta.license).toBe('https://spdx.org/licenses/GPL-3.0-only')
	})

	it('should warn about missing license', () => {
		const meta: Partial<CodeMeta> = { name: 'test' }
		const warnings = reconcile(meta)
		expect(warnings.some((warning) => warning.property === 'license')).toBe(true)
	})

	it('should not warn when all required fields are present', () => {
		const meta: Partial<CodeMeta> = {
			author: [{ '@type': 'Person', familyName: 'Doe', givenName: 'John' }],
			codeRepository: 'https://github.com/test/test',
			license: 'https://spdx.org/licenses/MIT',
			name: 'test',
		}
		const warnings = reconcile(meta)
		const requiredWarnings = warnings.filter(
			(w) => w.property === 'codeRepository' || w.property === 'author' || w.property === 'license',
		)
		expect(requiredWarnings).toHaveLength(0)
	})

	it('should detect GPL + non-GPL license conflict', () => {
		const meta: Partial<CodeMeta> = {
			license: ['https://spdx.org/licenses/GPL-3.0-only', 'https://spdx.org/licenses/MIT'],
		}
		const warnings = reconcile(meta)
		expect(
			warnings.some(
				(warning) => warning.property === 'license' && warning.message.includes('non-GPL'),
			),
		).toBe(true)
	})
})

describe('enrichGraph', () => {
	it('should infer programming language from runtimePlatform', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))
		graph.addString(subject, schema('runtimePlatform'), 'Python 3.9')

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		expect(doc.programmingLanguage).toBe('Python')
	})

	it('should copy authors to contributors when missing', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))

		const person = emitPerson({ '@type': 'Person', familyName: 'Doe', givenName: 'John' }, graph)
		graph.add(subject, schema('author'), person)

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		expect(doc.contributor).toBeDefined()
	})

	it('should set first author as maintainer when missing', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))

		const person = emitPerson({ '@type': 'Person', familyName: 'Doe', givenName: 'John' }, graph)
		graph.add(subject, schema('author'), person)

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		expect(doc.maintainer).toBeDefined()
	})

	it('should not overwrite existing programmingLanguage', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))
		graph.addString(subject, schema('programmingLanguage'), 'C++')
		graph.addString(subject, schema('runtimePlatform'), 'Python 3.9')

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		// Should still be C++, not overwritten with Python
		const langs = Array.isArray(doc.programmingLanguage)
			? doc.programmingLanguage
			: [doc.programmingLanguage]
		expect(langs).toContain('C++')
		// Should NOT have added Python since programmingLanguage already existed
		expect(langs).not.toContain('Python')
	})

	it('should not overwrite existing contributors', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))

		const author = emitPerson({ '@type': 'Person', familyName: 'Doe', givenName: 'John' }, graph)
		graph.add(subject, schema('author'), author)

		const contributor = emitPerson(
			{ '@type': 'Person', familyName: 'Smith', givenName: 'Alice' },
			graph,
		)
		graph.add(subject, schema('contributor'), contributor)

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		const contributors = Array.isArray(doc.contributor) ? doc.contributor : [doc.contributor]
		expect(contributors).toHaveLength(1)
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		expect((contributors[0] as Record<string, unknown>).familyName).toBe('Smith')
	})

	it('should not overwrite existing maintainer', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))

		const author = emitPerson({ '@type': 'Person', familyName: 'Doe', givenName: 'John' }, graph)
		graph.add(subject, schema('author'), author)

		const maintainer = emitPerson(
			{ '@type': 'Person', familyName: 'Smith', givenName: 'Alice' },
			graph,
		)
		graph.add(subject, codemeta('maintainer'), maintainer)

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const m = doc.maintainer as Record<string, unknown>
		expect(m.familyName).toBe('Smith')
	})

	it('should infer runtimePlatform from programmingLanguage', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))
		graph.addString(subject, schema('programmingLanguage'), 'Java')

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		expect(doc.runtimePlatform).toBe('Java')
	})

	it('should infer runtimePlatform for Kotlin', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))
		graph.addString(subject, schema('programmingLanguage'), 'Kotlin')

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		expect(doc.runtimePlatform).toBe('Java')
	})

	it('should not set maintainer when first author has noreply email', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))

		const person = emitPerson(
			{
				'@type': 'Person',
				email: 'noreply@github.com',
				familyName: 'Bot',
				givenName: 'GitHub',
			},
			graph,
		)
		graph.add(subject, schema('author'), person)

		enrichGraph(graph, subject)

		const doc = await graph.toJsonLd(SUBJECT)
		expect(doc.maintainer).toBeUndefined()
	})
})
