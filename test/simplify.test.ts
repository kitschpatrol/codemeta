import { describe, expect, it } from 'vitest'
import type { CodeMeta } from '../src/lib/types.js'
import { simplify } from '../src/lib/simplify.js'

/** Helper to create a minimal CodeMeta object. */
function codeMeta(properties: Record<string, unknown>): CodeMeta {
	// eslint-disable-next-line ts/consistent-type-assertions
	return {
		'@context': 'https://doi.org/10.5063/schema/codemeta-2.0',
		'@type': 'SoftwareSourceCode',
		...properties,
	} as CodeMeta
}

describe('simplify — JSON-LD boilerplate', () => {
	it('should strip @context, @type, and @id', () => {
		const result = simplify(
			codeMeta({
				'@id': 'https://example.org/software',
				name: 'test',
			}),
		)

		expect(result).not.toHaveProperty('@context')
		expect(result).not.toHaveProperty('@type')
		expect(result).not.toHaveProperty('@id')
		expect(result.name).toBe('test')
	})
})

describe('simplify — singular properties', () => {
	it('should pass through a string value unchanged', () => {
		const result = simplify(codeMeta({ name: 'My Software' }))
		expect(result.name).toBe('My Software')
	})

	it('should unwrap a single-element array', () => {
		const result = simplify(codeMeta({ description: ['A description'] }))
		expect(result.description).toBe('A description')
	})

	it('should take first value from multi-element array', () => {
		const result = simplify(codeMeta({ description: ['First', 'Second'] }))
		expect(result.description).toBe('First')
	})

	it('should coerce an object with @id to a string', () => {
		const result = simplify(codeMeta({ license: { '@id': 'http://spdx.org/licenses/MIT' } }))
		expect(result.license).toBe('http://spdx.org/licenses/MIT')
	})

	it('should coerce an object with name to a string', () => {
		const result = simplify(codeMeta({ url: { name: 'https://example.com' } }))
		expect(result.url).toBe('https://example.com')
	})

	it('should preserve number values', () => {
		const result = simplify(codeMeta({ copyrightYear: 2024 }))
		expect(result.copyrightYear).toBe(2024)
	})
})

describe('simplify — person/org array properties', () => {
	it('should normalize a single person object to an array', () => {
		const result = simplify(
			codeMeta({
				author: {
					'@type': 'Person',
					email: 'jane@example.com',
					name: 'Jane Doe',
				},
			}),
		)

		expect(result.author).toEqual([
			{
				email: 'jane@example.com',
				name: 'Jane Doe',
				type: 'Person',
			},
		])
	})

	it('should flatten multiple authors', () => {
		const result = simplify(
			codeMeta({
				author: [
					{ '@type': 'Person', familyName: 'Doe', givenName: 'Jane' },
					{ '@type': 'Organization', name: 'ACME Corp', url: 'https://acme.com' },
				],
			}),
		)

		expect(result.author).toHaveLength(2)
		expect(result.author![0]).toEqual({
			familyName: 'Doe',
			givenName: 'Jane',
			type: 'Person',
		})
		expect(result.author![1]).toEqual({
			name: 'ACME Corp',
			type: 'Organization',
			url: 'https://acme.com',
		})
	})

	it('should convert a string value to a Person object in an array', () => {
		const result = simplify(codeMeta({ author: 'Jane Doe' }))
		expect(result.author).toEqual([{ name: 'Jane Doe', type: 'Person' }])
	})

	it('should default to Person type when @type is missing', () => {
		const result = simplify(codeMeta({ maintainer: { name: 'Bob' } }))
		expect(result.maintainer).toEqual([{ name: 'Bob', type: 'Person' }])
	})

	it('should strip extra properties from person objects', () => {
		const result = simplify(
			codeMeta({
				author: {
					'@id': 'https://orcid.org/0000-0001',
					'@type': 'Person',
					affiliation: 'University',
					name: 'Jane',
				},
			}),
		)

		const author = result.author![0]
		expect(author.name).toBe('Jane')
		expect(author).not.toHaveProperty('affiliation')
		expect(author).not.toHaveProperty('@id')
	})
})

describe('simplify — dependency array properties', () => {
	it('should flatten dependency objects', () => {
		const result = simplify(
			codeMeta({
				softwareRequirements: [
					{
						'@type': 'SoftwareSourceCode',
						identifier: 'lodash',
						name: 'lodash',
						version: '^4.17.0',
					},
				],
			}),
		)

		expect(result.softwareRequirements).toEqual([
			{
				identifier: 'lodash',
				name: 'lodash',
				type: 'SoftwareSourceCode',
				version: '^4.17.0',
			},
		])
	})

	it('should wrap a single dependency in an array', () => {
		const result = simplify(
			codeMeta({
				softwareRequirements: {
					'@type': 'SoftwareSourceCode',
					name: 'express',
				},
			}),
		)

		expect(result.softwareRequirements).toHaveLength(1)
		expect(result.softwareRequirements![0].name).toBe('express')
	})
})

describe('simplify — string array properties', () => {
	it('should wrap a single string in an array', () => {
		const result = simplify(codeMeta({ keywords: 'typescript' }))
		expect(result.keywords).toEqual(['typescript'])
	})

	it('should keep an array of strings as-is', () => {
		const result = simplify(codeMeta({ keywords: ['typescript', 'metadata'] }))
		expect(result.keywords).toEqual(['typescript', 'metadata'])
	})

	it('should coerce numbers in string arrays', () => {
		const result = simplify(codeMeta({ runtimePlatform: [3.11, 3.12] }))
		expect(result.runtimePlatform).toEqual(['3.11', '3.12'])
	})

	it('should coerce objects with name in string arrays', () => {
		const result = simplify(
			codeMeta({
				programmingLanguage: { name: 'TypeScript' },
			}),
		)
		expect(result.programmingLanguage).toEqual(['TypeScript'])
	})
})

describe('simplify — unknown properties', () => {
	it('should pass through unknown properties unchanged', () => {
		const result = simplify(codeMeta({ customField: 'hello' }))
		expect(result.customField).toBe('hello')
	})
})

describe('simplify — integration with generate', () => {
	it('should be importable from main index', async () => {
		const { simplify: s } = await import('../src/lib/index.js')
		expect(s).toBeTypeOf('function')
	})
})
