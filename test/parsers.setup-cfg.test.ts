/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseSetupCfg } from '../src/lib/parsers/setup-cfg.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/setup-cfg')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseSetupCfg(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('setup.cfg parser — basic', () => {
	const fixture = resolve(fixtures, 'basic.setup.cfg')

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
		expect(meta.license).toBe('http://spdx.org/licenses/MIT')
	})

	it('should parse classifiers into development status', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#active')
	})

	it('should parse classifiers into operating system', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.operatingSystem).toBe('OS Independent')
	})

	it('should parse install_requires as dependencies', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements.length).toBe(3)
		expect(requirements.find((d) => d.name === 'requests')).toBeDefined()
		expect(requirements.find((d) => d.name === 'click')).toBeDefined()
		expect(requirements.find((d) => d.name === 'pyyaml')).toBeDefined()
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

	it('should parse keywords', async () => {
		const meta = await parseToJsonLd(fixture)
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('example')
	})
})

describe('setup.cfg parser — with project URLs', () => {
	const fixture = resolve(fixtures, 'with-urls.setup.cfg')

	it('should parse project_urls', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/alice/urltest')
		expect(meta.issueTracker).toBe('https://github.com/alice/urltest/issues')
		expect(meta.softwareHelp).toBe('https://urltest.readthedocs.io')
	})
})

describe('setup.cfg parser — minimal', () => {
	const fixture = resolve(fixtures, 'minimal.setup.cfg')

	it('should parse minimal setup.cfg', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('minimal-pkg')
		expect(meta.version).toBe('0.1.0')
		expect(meta.runtimePlatform).toBe('Python 3')
	})
})
