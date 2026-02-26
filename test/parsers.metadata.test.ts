/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseMetadata } from '../src/lib/parsers/metadata.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/metadata')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseMetadata(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('metadata parser — JSON format', () => {
	const fixture = resolve(fixtures, 'basic.metadata.json')

	it('should parse description', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.description).toBe('JSON metadata file for testing')
	})

	it('should parse homepage as url', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.url).toBe('https://json-example.com')
	})

	it('should parse keywords', async () => {
		const meta = await parseToJsonLd(fixture)
		const keywords = [meta.keywords].flat() as string[]
		expect(keywords).toContain('json')
		expect(keywords).toContain('metadata')
		expect(keywords).toContain('testing')
	})

	it('should use keywords over tags and topics', async () => {
		const meta = await parseToJsonLd(fixture)
		const keywords = [meta.keywords].flat() as string[]
		// Tags and topics should be ignored when keywords is present
		expect(keywords).not.toContain('tag1')
		expect(keywords).not.toContain('topic1')
	})
})

describe('metadata parser — YAML format', () => {
	it('should parse .yml file', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'basic.metadata.yml'))
		expect(meta.description).toBe('YAML metadata file for testing')
		expect(meta.url).toBe('https://yaml-example.com')
	})

	it('should parse .yaml file', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'basic.metadata.yaml'))
		expect(meta.description).toBe('Extended YAML metadata file for testing')
	})

	it('should parse keywords from YAML arrays', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'basic.metadata.yml'))
		const keywords = [meta.keywords].flat() as string[]
		expect(keywords).toContain('yaml')
		expect(keywords).toContain('metadata')
		expect(keywords).toContain('testing')
	})
})

describe('metadata parser — url fallback chain', () => {
	it('should fall back to url when homepage is absent', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'url-fallback.metadata.json'))
		expect(meta.url).toBe('https://url-fallback-example.com')
	})

	it('should fall back to repository (normalized) when homepage and url are absent', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'repository-fallback.metadata.json'))
		expect(meta.url).toBe('https://repository-fallback-example.com')
	})

	it('should fall back to website when homepage, url, and repository are absent', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'website-fallback.metadata.json'))
		expect(meta.url).toBe('https://website-fallback-example.com')
	})

	it('should prefer url over website in YAML', async () => {
		// Basic.metadata.yaml has url, repository, and website — url should win
		const meta = await parseToJsonLd(resolve(fixtures, 'basic.metadata.yaml'))
		expect(meta.url).toBe('https://extended-yaml-example.com')
	})
})

describe('metadata parser — repository as url fallback', () => {
	it('should normalize git+ prefix and .git suffix for url', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'git-url.metadata.json'))
		// No homepage/url/website, so repository is used as url fallback (normalized)
		expect(meta.url).toBe('https://github.com/test/metadata-git-url')
	})

	it('should not emit codeRepository', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'basic.metadata.yaml'))
		expect(meta.codeRepository).toBeUndefined()
	})
})

describe('metadata parser — keyword fallbacks', () => {
	it('should fall back to tags when keywords is absent', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'tags-fallback.metadata.json'))
		const keywords = [meta.keywords].flat() as string[]
		expect(keywords).toContain('tag1')
		expect(keywords).toContain('tag2')
		expect(keywords).toContain('tags-fallback')
	})

	it('should fall back to topics when keywords and tags are absent', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'topics-fallback.metadata.json'))
		const keywords = [meta.keywords].flat() as string[]
		expect(keywords).toContain('topic1')
		expect(keywords).toContain('topic2')
		expect(keywords).toContain('topics-fallback')
	})

	it('should prefer tags over topics when keywords is absent', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'keyword-variants.metadata.json'))
		const keywords = [meta.keywords].flat() as string[]
		// Has both tags and topics but no keywords, tags should win
		expect(keywords).toContain('tag1')
		expect(keywords).toContain('tag2')
		expect(keywords).not.toContain('topic1')
	})
})

describe('metadata parser — findParser integration', () => {
	it('should match metadata.json', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		const entry = findParser('metadata.json')
		expect(entry).toBeDefined()
		expect(entry!.name).toBe('metadata')
	})

	it('should match metadata.yaml', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		const entry = findParser('metadata.yaml')
		expect(entry).toBeDefined()
		expect(entry!.name).toBe('metadata')
	})

	it('should match metadata.yml', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		const entry = findParser('metadata.yml')
		expect(entry).toBeDefined()
		expect(entry!.name).toBe('metadata')
	})

	it('should have priority 15', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		const entry = findParser('metadata.json')
		expect(entry!.priority).toBe(15)
	})
})
