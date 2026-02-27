/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseRust } from '../src/lib/parsers/rust.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/cargo')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseRust(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('Rust parser — basic Cargo.toml (proycon-analiticcl)', () => {
	const fixture = resolve(fixtures, 'proycon-analiticcl.Cargo.toml')

	it('should parse basic properties', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('analiticcl')
		expect(meta.identifier).toBe('analiticcl')
		expect(meta.version).toBe('0.4.5')
		expect(meta.description).toBe(
			'Analiticcl is an approximate string matching or fuzzy-matching system that can be used to find variants for spelling correction or text normalisation',
		)
	})

	it('should parse license', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('http://spdx.org/licenses/GPL-3.0-or-later')
	})

	it('should parse author', async () => {
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0]['@type']).toBe('Person')
		expect(authors[0].givenName).toBe('Maarten')
		expect(authors[0].familyName).toBe('van Gompel')
		expect(authors[0].email).toBe('proycon@anaproy.nl')
	})

	it('should parse keywords', async () => {
		const meta = await parseToJsonLd(fixture)
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('nlp')
		expect(keywords).toContain('spelling-correction')
		expect(keywords).toContain('linguistics')
	})

	it('should parse repository as codeRepository', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/proycon/analiticcl')
	})

	it('should parse homepage as url and codeRepository fallback', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.url).toBe('https://github.com/proycon/analiticcl')
	})

	it('should parse documentation as softwareHelp', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.softwareHelp).toBe('https://docs.rs/analiticcl')
	})

	it('should parse dependencies as softwareRequirements', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements.length).toBeGreaterThan(0)
		for (const dep of requirements) {
			expect(dep['@type']).toBe('SoftwareSourceCode')
			expect(dep.identifier).toBeDefined()
			expect(dep.name).toBeDefined()
		}
		const clap = requirements.find((d) => d.name === 'clap')
		expect(clap).toBeDefined()
		expect(clap!.version).toBe('2.34.0')
	})

	it('should parse dev-dependencies as softwareSuggestions', async () => {
		const meta = await parseToJsonLd(fixture)
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>
		expect(suggestions).toHaveLength(1)
		expect(suggestions[0].name).toBe('criterion')
		expect(suggestions[0].version).toBe('0.3.6')
	})

	it('should construct readme web URL from codeRepository and filename', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.readme).toBe('https://github.com/proycon/analiticcl/blob/HEAD/README.md')
	})

	it('should set programmingLanguage to Rust', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.programmingLanguage).toBe('Rust')
	})
})

describe('Rust parser — compound license (smol-rs-smol)', () => {
	const fixture = resolve(fixtures, 'smol-rs-smol.Cargo.toml')

	it('should split SPDX OR license into multiple entries', async () => {
		const meta = await parseToJsonLd(fixture)
		const licenses = Array.isArray(meta.license) ? meta.license : [meta.license]
		expect(licenses).toContain('http://spdx.org/licenses/Apache-2.0')
		expect(licenses).toContain('http://spdx.org/licenses/MIT')
	})

	it('should parse categories as applicationCategory', async () => {
		const meta = await parseToJsonLd(fixture)
		const categories = Array.isArray(meta.applicationCategory)
			? meta.applicationCategory
			: [meta.applicationCategory]
		expect(categories).toContain('asynchronous')
		expect(categories).toContain('concurrency')
		expect(categories).toContain('network-programming')
	})

	it('should handle object-format dev-dependencies', async () => {
		const meta = await parseToJsonLd(fixture)
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>
		// Async-tungstenite = { version = "0.32", features = [...] }
		const asyncTungstenite = suggestions.find((d) => d.name === 'async-tungstenite')
		expect(asyncTungstenite).toBeDefined()
		expect(asyncTungstenite!.version).toBe('0.32')
	})
})

describe('Rust parser — workspace-only Cargo.toml (ilya-zlobintsev-lact)', () => {
	const fixture = resolve(fixtures, 'ilya-zlobintsev-lact.Cargo.toml')

	it('should handle workspace-only Cargo.toml gracefully', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.programmingLanguage).toBe('Rust')
		// No package section means no name/version/etc
		expect(meta.name).toBeUndefined()
	})
})
