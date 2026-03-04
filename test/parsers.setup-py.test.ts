/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseSetupPy } from '../src/lib/parsers/setup-py.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/setup-py')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseSetupPy(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('setup.py parser — basic', () => {
	const fixture = resolve(fixtures, 'basic.setup.py')

	it('should parse name and version', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('example-package')
		expect(meta.version).toBe('1.2.3')
	})

	it('should parse description', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.description).toBe('A short description of the package')
	})

	it('should parse author', async () => {
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors.length).toBeGreaterThan(0)
	})

	it('should parse license', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
	})

	it('should parse keywords', async () => {
		const meta = await parseToJsonLd(fixture)
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('example')
		expect(keywords).toContain('test')
		expect(keywords).toContain('metadata')
	})

	it('should parse classifiers into development status', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#active')
	})

	it('should parse install_requires as dependencies', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements.length).toBe(3)
		expect(requirements.find((d) => d.name === 'requests')).toBeDefined()
	})

	it('should parse python_requires as runtimePlatform', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.runtimePlatform).toBe('Python >=3.8')
	})

	it('should parse extras_require as softwareSuggestions', async () => {
		const meta = await parseToJsonLd(fixture)
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>
		expect(suggestions.length).toBeGreaterThan(0)
		expect(suggestions.find((d) => d.name === 'pytest')).toBeDefined()
	})

	it('should parse project_urls', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/example/example-package')
		expect(meta.issueTracker).toBe('https://github.com/example/example-package/issues')
	})
})

describe('setup.py parser — with variables', () => {
	const fixture = resolve(fixtures, 'with-variables.setup.py')

	it('should skip variable references and extract literals', async () => {
		const meta = await parseToJsonLd(fixture)
		// Version=VERSION is a variable — should be null/undefined
		expect(meta.version).toBeUndefined()
		// Author=AUTHOR is a variable — should be null/undefined
		expect(meta.author).toBeUndefined()
		// Literals should be extracted
		expect(meta.name).toBe('dynamic-pkg')
		expect(meta.description).toBe('Package with variables')
		expect(meta.license).toBe('https://spdx.org/licenses/BSD-3-Clause')
	})

	it('should still parse literal dependencies', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements.length).toBe(2)
		expect(requirements.find((d) => d.name === 'numpy')).toBeDefined()
	})
})

describe('setup.py parser — minimal', () => {
	const fixture = resolve(fixtures, 'minimal.setup.py')

	it('should parse minimal setup.py', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('minimal-pkg')
		expect(meta.version).toBe('0.1.0')
		expect(meta.runtimePlatform).toBe('Python 3')
	})
})
