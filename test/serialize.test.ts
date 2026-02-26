/* eslint-disable ts/no-unsafe-type-assertion */
/* eslint-disable ts/no-unsafe-assignment */

import { describe, expect, it } from 'vitest'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'

const SUBJECT = 'https://example.org/test'

async function graphToJsonLd(
	build: (graph: CodeMetaGraph, subject: ReturnType<typeof namedNode>) => void,
): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	build(graph, subject)
	return graph.toJsonLd(SUBJECT)
}

describe('CodeMetaGraph.toJsonLd', () => {
	it('should add @context and @type', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			graph.addString(subject, schema('name'), 'Test')
		})
		const context = doc['@context'] as string[]
		expect(context).toContain('https://w3id.org/codemeta/3.1')
		expect(doc['@type']).toBe('SoftwareSourceCode')
	})

	it('should include @id when subject has an IRI', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			graph.addString(subject, schema('name'), 'Test')
		})
		expect(doc['@id']).toBe(SUBJECT)
	})

	it('should serialize string properties', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			graph.addString(subject, schema('name'), 'Test')
			graph.addString(subject, schema('version'), '1.0')
			graph.addString(subject, schema('description'), 'A test')
		})
		expect(doc.name).toBe('Test')
		expect(doc.version).toBe('1.0')
		expect(doc.description).toBe('A test')
	})

	it('should serialize URL properties', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			graph.addUrl(subject, schema('codeRepository'), 'https://github.com/test/test')
			graph.addUrl(subject, schema('license'), 'http://spdx.org/licenses/MIT')
		})
		expect(doc.codeRepository).toBe('https://github.com/test/test')
		expect(doc.license).toBe('http://spdx.org/licenses/MIT')
	})

	it('should serialize person blank nodes', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			const person = graph.blank()
			graph.setType(person, schema('Person'))
			graph.addString(person, schema('givenName'), 'John')
			graph.addString(person, schema('familyName'), 'Doe')
			graph.addString(person, schema('email'), 'john@example.com')
			graph.add(subject, schema('author'), person)
		})
		expect(doc.author).toBeDefined()
		const authors = Array.isArray(doc.author) ? doc.author : [doc.author]
		const author = authors[0] as Record<string, unknown>
		expect(author['@type']).toBe('Person')
		expect(author.givenName).toBe('John')
		expect(author.familyName).toBe('Doe')
		expect(author.email).toBe('john@example.com')
	})

	it('should serialize organization blank nodes', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			const org = graph.blank()
			graph.setType(org, schema('Organization'))
			graph.addString(org, schema('name'), 'KNAW Humanities Cluster')
			graph.addUrl(org, schema('url'), 'https://huc.knaw.nl')
			graph.add(subject, schema('producer'), org)
		})
		expect(doc.producer).toBeDefined()
		const producer = doc.producer as Record<string, unknown>
		expect(producer['@type']).toBe('Organization')
		expect(producer.name).toBe('KNAW Humanities Cluster')
		expect(producer.url).toBe('https://huc.knaw.nl')
	})

	it('should serialize software dependencies', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			const dep1 = graph.blank()
			graph.setType(dep1, schema('SoftwareApplication'))
			graph.addString(dep1, schema('identifier'), 'dep1')
			graph.addString(dep1, schema('name'), 'dep1')
			graph.addString(dep1, schema('version'), '1.0')
			graph.add(subject, schema('softwareRequirements'), dep1)

			const dep2 = graph.blank()
			graph.setType(dep2, schema('SoftwareApplication'))
			graph.addString(dep2, schema('identifier'), 'dep2')
			graph.addString(dep2, schema('name'), 'dep2')
			graph.add(subject, schema('softwareRequirements'), dep2)
		})
		const requirements = doc.softwareRequirements as Array<Record<string, unknown>>
		expect(requirements).toHaveLength(2)
		expect(requirements[0]['@type']).toBe('SoftwareApplication')
		expect(requirements[1]['@type']).toBe('SoftwareApplication')
	})

	it('should serialize multiple keywords', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			graph.addString(subject, schema('keywords'), 'nlp')
			graph.addString(subject, schema('keywords'), 'dutch')
		})
		const keywords = Array.isArray(doc.keywords) ? doc.keywords : [doc.keywords]
		expect(keywords).toContain('nlp')
		expect(keywords).toContain('dutch')
	})

	it('should include schema.org in context', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			graph.addString(subject, schema('name'), 'Test')
		})
		const context = doc['@context'] as string[]
		expect(context).toContain('https://schema.org')
	})

	it('should produce valid JSON', async () => {
		const doc = await graphToJsonLd((graph, subject) => {
			graph.addString(subject, schema('name'), 'Test')
			graph.addString(subject, schema('version'), '1.0')
		})
		const json = JSON.stringify(doc)
		const parsed: Record<string, unknown> = JSON.parse(json)
		expect(parsed.name).toBe('Test')
		const context = parsed['@context'] as string[]
		expect(context).toContain('https://w3id.org/codemeta/3.1')
	})
})
