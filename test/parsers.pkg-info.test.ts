/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parsePkgInfo } from '../src/lib/parsers/pkg-info.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/pkg-info')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parsePkgInfo(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('PKG-INFO parser — basic', () => {
	const fixture = resolve(fixtures, 'basic.PKG-INFO')

	it('should parse name and version', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('example-package')
		expect(meta.version).toBe('1.2.3')
	})

	it('should parse summary as description', async () => {
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

	it('should parse Home-Page as url', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.url).toBe('https://example.com/example-package')
	})

	it('should parse classifiers into development status', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#active')
	})

	it('should parse Requires-Dist as dependencies', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements.length).toBe(3)
		expect(requirements.find((d) => d.name === 'requests')).toBeDefined()
		expect(requirements.find((d) => d.name === 'click')).toBeDefined()
	})

	it('should parse Requires-Python as runtimePlatform', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.runtimePlatform).toBe('Python >=3.8')
	})

	it('should parse Project-URL entries', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/example/example-package')
		expect(meta.issueTracker).toBe('https://github.com/example/example-package/issues')
		expect(meta.softwareHelp).toBe('https://example-package.readthedocs.io')
	})
})

describe('PKG-INFO parser — minimal', () => {
	const fixture = resolve(fixtures, 'minimal.PKG-INFO')

	it('should parse minimal PKG-INFO', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('minimal-pkg')
		expect(meta.version).toBe('0.1.0')
		expect(meta.runtimePlatform).toBe('Python 3')
	})
})
