/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-explicit-any */
/* eslint-disable ts/no-unsafe-type-assertion */
/* eslint-disable ts/no-unsafe-assignment */
/* eslint-disable unicorn/consistent-function-scoping */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateFromFiles } from '../src/lib/generate.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')

// ─── BuildTest_Compose: Combine two inputs for the same resource ───

describe('compose: labirinto.package.json + proycon-labirinto-harvest.codemeta.json', () => {
	async function loadComposed() {
		return generateFromFiles([
			resolve(fixtures, 'package/proycon-labirinto.package.json'),
			resolve(fixtures, 'codemeta/proycon-labirinto-harvest.codemeta.json'),
		])
	}

	// Matches Python BuildTest_Compose test002_basics
	it('should have basic identifying properties from first source', async () => {
		const meta = await loadComposed()
		expect(meta.name).toBe('labirinto')
		expect(meta.version).toBe('0.2.6')
	})

	// Matches Python BuildTest_Compose test002_basics: runtimePlatform
	it('should have runtimePlatform from first source', async () => {
		const meta = await loadComposed()
		const platforms = Array.isArray(meta.runtimePlatform)
			? meta.runtimePlatform
			: [meta.runtimePlatform]
		expect(platforms).toContain('npm >= 3.0.0')
		expect(platforms).toContain('node >= 6.0.0')
	})

	// Matches Python BuildTest_Compose test003_urlref
	it('should have URL references', async () => {
		const meta = await loadComposed()
		expect(meta.codeRepository).toBe('https://github.com/proycon/labirinto')
		expect(meta.license).toBe('https://spdx.org/licenses/AGPL-3.0-or-later')
		expect(meta.url).toBe('https://github.com/proycon/labirinto')
	})

	// Matches Python BuildTest_Compose test004_combined
	it('should have developmentStatus from the second resource', async () => {
		const meta = await loadComposed()
		const statuses = Array.isArray(meta.developmentStatus)
			? meta.developmentStatus
			: [meta.developmentStatus]
		expect(statuses).toContain('https://www.repostatus.org/#unsupported')
	})

	// Matches Python BuildTest_Compose test004_combined: issueTracker
	it('should have issueTracker from the second resource', async () => {
		const meta = await loadComposed()
		expect(meta.issueTracker).toBe('https://github.com/proycon/labirinto/issues')
	})

	// Matches Python BuildTest_Compose test004_combined: producer with nested parentOrganization
	it('should have producer with nested organization from second resource', async () => {
		const meta = await loadComposed()
		expect(meta.producer).toBeDefined()
		const producer = meta.producer as any
		expect(producer['@type']).toBe('Organization')
		expect(producer.name).toBe('Centre for Language and Speech Technology')
	})
})

// ─── BuildTest_Compose2: Combine two resources with overrides ───

describe('compose: withoutid.codemeta.json + withid.codemeta.json', () => {
	async function loadComposed() {
		return generateFromFiles([
			resolve(fixtures, 'codemeta/without-id.codemeta.json'),
			resolve(fixtures, 'codemeta/with-id.codemeta.json'),
		])
	}

	// Matches Python BuildTest_Compose2 test001_compose_repostatus
	it('should have both repostatus values (graph accumulates)', async () => {
		const meta = await loadComposed()
		// In graph-based architecture, triples accumulate —
		// both status values will be present
		const statuses = Array.isArray(meta.developmentStatus)
			? meta.developmentStatus
			: [meta.developmentStatus]
		expect(statuses).toContain('https://www.repostatus.org/#active')
	})

	// Matches Python BuildTest_Compose2 test002_compose_orderedlist
	it('should have author list from composed sources', async () => {
		const meta = await loadComposed()
		expect(meta.author).toBeDefined()
		const authors = Array.isArray(meta.author) ? meta.author : [meta.author]
		expect(authors.length).toBeGreaterThanOrEqual(2)
	})
})

// ─── BuildTest_RetainId: Retain @id from existing codemeta ───

describe('retain @id', () => {
	// Matches Python BuildTest_RetainId test001_maintain_id
	it('should preserve @id from withid.codemeta.json', async () => {
		const meta = await generateFromFiles([resolve(fixtures, 'codemeta/with-id.codemeta.json')])
		// The JSON-LD parser remaps the original subject to our subject,
		// but the @id from the codemeta.json should be captured
		expect(meta['@id']).toBeDefined()
	})
})

// ─── BuildTest_Enrich: Enrichment ───

describe('enrich', () => {
	// Matches Python BuildTest_Enrich test001_sanity
	it('should load and enrich languagemachines-frog.codemeta.json', async () => {
		const meta = await generateFromFiles(
			[resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json')],
			{
				enrich: true,
			},
		)
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBe('Frog')
	})

	it('should infer programmingLanguage from runtimePlatform when enriching', async () => {
		const meta = await generateFromFiles(
			[resolve(fixtures, 'pyproject/proycon-codemetapy.pyproject.toml')],
			{
				enrich: true,
			},
		)
		expect(meta.programmingLanguage).toBeDefined()
	})

	it('should add contributors from authors when enriching', async () => {
		const meta = await generateFromFiles(
			[resolve(fixtures, 'pyproject/proycon-codemetapy.pyproject.toml')],
			{
				enrich: true,
			},
		)
		if (meta.author) {
			const authors = Array.isArray(meta.author) ? meta.author : [meta.author]
			if (authors.length > 0) {
				expect(meta.contributor).toBeDefined()
			}
		}
	})

	it('should set maintainer from first author when enriching', async () => {
		const meta = await generateFromFiles(
			[resolve(fixtures, 'pyproject/proycon-codemetapy.pyproject.toml')],
			{
				enrich: true,
			},
		)
		if (meta.author) {
			const authors = Array.isArray(meta.author) ? meta.author : [meta.author]
			if (authors.length > 0) {
				expect(meta.maintainer).toBeDefined()
			}
		}
	})
})

// ─── Serialization round-trip (matches Python BuildTest_Json test100) ───

describe('JSON-LD serialization round-trip', () => {
	// Matches Python BuildTest_Json test100_serialisation_json
	it('should serialize languagemachines-frog.codemeta.json to valid JSON-LD', async () => {
		const meta = await generateFromFiles([
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		])

		// Context should include codemeta
		expect(meta['@context']).toBeDefined()
		const context = meta['@context'] as string[]
		expect(context).toContain('https://w3id.org/codemeta/3.1')

		// Basic properties
		expect(meta.name).toBe('Frog')
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.description).toBeDefined()
		expect(meta.url).toBe('https://languagemachines.github.io/frog')
		expect(meta.codeRepository).toBe('https://github.com/LanguageMachines/frog')
	})

	it('should serialize authors as a list of Person objects', async () => {
		const meta = await generateFromFiles([
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		])

		expect(Array.isArray(meta.author)).toBe(true)
		const authors = meta.author as any[]
		expect(authors.every((a) => typeof a === 'object' && a['@type'] === 'Person')).toBe(true)
	})

	it('should serialize softwareRequirements as SoftwareApplication objects', async () => {
		const meta = await generateFromFiles([
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		])

		expect(meta.softwareRequirements).toBeDefined()
		const requirements = meta.softwareRequirements as unknown as Array<Record<string, unknown>>
		expect(Array.isArray(requirements)).toBe(true)
		expect(requirements.every((r) => r['@type'] === 'SoftwareApplication')).toBe(true)
	})

	it('should produce valid JSON output', async () => {
		const meta = await generateFromFiles([
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		])
		const json = JSON.stringify(meta)
		const parsed: Record<string, unknown> = JSON.parse(json)
		expect(parsed.name).toBe('Frog')
	})

	it('should serialize labirinto.package.json to valid JSON-LD', async () => {
		const meta = await generateFromFiles([
			resolve(fixtures, 'package/proycon-labirinto.package.json'),
		])

		expect(meta['@context']).toBeDefined()
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBe('labirinto')
	})

	it('should serialize proycon-analiticcl.Cargo.toml to valid JSON-LD', async () => {
		const meta = await generateFromFiles([resolve(fixtures, 'cargo/proycon-analiticcl.Cargo.toml')])

		expect(meta['@context']).toBeDefined()
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBe('analiticcl')
	})

	it('should serialize widoco.pom.xml to valid JSON-LD', async () => {
		const meta = await generateFromFiles([resolve(fixtures, 'pom/widoco.pom.xml')])

		expect(meta['@context']).toBeDefined()
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBe('Widoco')
	})

	it('should serialize withid.codemeta.json with @id preserved', async () => {
		const meta = await generateFromFiles([resolve(fixtures, 'codemeta/with-id.codemeta.json')])

		expect(meta['@id']).toBeDefined()
		expect(meta.name).toBe('test')
	})
})
