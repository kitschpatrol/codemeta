import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseGoreleaser } from '../src/lib/parsers/goreleaser.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/goreleaser')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseGoreleaser(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

// ─── Basic metadata ───

describe('GoReleaser parser — basic metadata', () => {
	it('should extract project_name as name', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'aenthill-aenthill..goreleaser.yml'))
		expect(meta.name).toBe('Aenthill')
	})

	it('should infer programmingLanguage as Go', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'aenthill-aenthill..goreleaser.yml'))
		expect(meta.programmingLanguage).toBe('Go')
	})

	it('should extract description from nfpms (highest priority)', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'jbvmio-kafkactl..goreleaser.yml'))
		// Nfpms description takes priority over brews description
		expect(meta.description).toBe('CLI for Apache Kafka Management')
	})

	it('should extract description from brews when nfpms absent', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'aenthill-aenthill..goreleaser.yml'))
		expect(meta.description).toBe(
			'command-line tool that helps bootstraping your Docker projects easily',
		)
	})

	it('should extract description from snapcrafts', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'goplus-llgo..goreleaser.yaml'))
		// Nfpms has description too, but it should come first in priority
		expect(meta.description).toBeDefined()
		expect(String(meta.description).length).toBeGreaterThan(10)
	})
})

// ─── License ───

describe('GoReleaser parser — license', () => {
	it('should extract license from nfpms and normalize to SPDX URI', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'jbvmio-kafkactl..goreleaser.yml'))
		expect(meta.license).toBe('https://spdx.org/licenses/Apache-2.0')
	})

	it('should extract license from scoop section', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'aenthill-aenthill..goreleaser.yml'))
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
	})

	it('should extract license from brews', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'arashnrim-tp..goreleaser.yaml'))
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
	})
})

// ─── URLs ───

describe('GoReleaser parser — URLs', () => {
	it('should extract homepage as url', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'jbvmio-kafkactl..goreleaser.yml'))
		expect(meta.url).toBe('https://www.jbvm.io/')
	})

	it('should set codeRepository from homepage when it matches a source repo', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'arashnrim-tp..goreleaser.yaml'))
		// Homepage is https://github.com/arashnrim/tp
		expect(meta.url).toBe('https://github.com/arashnrim/tp')
		expect(meta.codeRepository).toBe('https://github.com/arashnrim/tp')
	})

	it('should set codeRepository from release.github', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'golangci-golangci-lint..goreleaser.yml'))
		expect(meta.codeRepository).toBe('https://github.com/golangci/golangci-lint')
	})
})

// ─── People & organizations ───

describe('GoReleaser parser — people and organizations', () => {
	it('should extract maintainer from nfpms as Person', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'goplus-llgo..goreleaser.yaml'))
		// Maintainer: "Aofei Sheng <aofei@aofeisheng.com>"
		expect(meta.maintainer).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const maintainer = meta.maintainer as Record<string, unknown>
		expect(maintainer['@type']).toBe('Person')
		expect(maintainer.email).toBe('aofei@aofeisheng.com')
	})

	it('should extract vendor from nfpms as Organization author', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'jbvmio-kafkactl..goreleaser.yml'))
		expect(meta.author).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const authors = meta.author as Array<Record<string, unknown>>
		expect(authors[0]['@type']).toBe('Organization')
		expect(authors[0].name).toBe('jbvm.io')
	})
})

// ─── Operating systems ───

describe('GoReleaser parser — operating systems', () => {
	it('should extract operating systems from builds goos', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'aenthill-aenthill..goreleaser.yml'))
		const os = meta.operatingSystem
		expect(os).toBeDefined()
		// Goos: linux, darwin, windows
		const osList = Array.isArray(os) ? os : [os]
		expect(osList).toContain('Linux')
		expect(osList).toContain('macOS')
		expect(osList).toContain('Windows')
	})

	it('should deduplicate OS values across multiple builds', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'archway-network-relayer-exporter..goreleaser.yaml'),
		)
		// Multiple builds all target linux and darwin
		const os = meta.operatingSystem
		const osList = Array.isArray(os) ? os : [os]
		expect(osList).toContain('Linux')
		expect(osList).toContain('macOS')
		// Should not have duplicates
		expect(new Set(osList).size).toBe(osList.length)
	})
})

// ─── Keywords ───

describe('GoReleaser parser — keywords', () => {
	it('should extract keywords from chocolateys tags', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'graphixa-fontget..goreleaser.yaml'))
		const { keywords } = meta
		expect(keywords).toBeDefined()
		const kwList = Array.isArray(keywords) ? keywords : [keywords]
		expect(kwList).toContain('fonts')
		expect(kwList).toContain('cli')
	})
})

// ─── Rich metadata fixtures ───

describe('GoReleaser parser — rich metadata', () => {
	it('should extract multiple fields from golangci-lint', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'golangci-golangci-lint..goreleaser.yml'))
		expect(meta.name).toBe('golangci-lint')
		expect(meta.programmingLanguage).toBe('Go')
		expect(meta.description).toBeDefined()
		expect(meta.license).toBe('https://spdx.org/licenses/GPL-3.0-or-later')
		expect(meta.codeRepository).toBe('https://github.com/golangci/golangci-lint')
	})

	it('should extract multiple fields from fontget', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'graphixa-fontget..goreleaser.yaml'))
		expect(meta.name).toBe('fontget')
		expect(meta.description).toBe('FontGet CLI tool for managing fonts')
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
		expect(meta.url).toBe('https://github.com/Graphixa/FontGet')
		expect(meta.codeRepository).toBe('https://github.com/Graphixa/FontGet')

		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const authors = meta.author as Array<Record<string, unknown>>
		expect(authors[0]['@type']).toBe('Organization')
		expect(authors[0].name).toBe('Graphixa')
	})

	it('should extract multi-line description from goplus-llgo', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'goplus-llgo..goreleaser.yaml'))
		const desc = String(meta.description)
		expect(desc).toContain('LLGo')
		expect(desc).toContain('LLVM')
	})
})

// ─── Minimal configs ───

describe('GoReleaser parser — minimal configs', () => {
	it('should handle config with no package manager sections', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'archway-network-relayer-exporter..goreleaser.yaml'),
		)
		expect(meta.name).toBe('relayer_exporter')
		expect(meta.programmingLanguage).toBe('Go')
		// No description, license, etc. from package managers
		expect(meta.description).toBeUndefined()
	})

	it('should handle config with no project_name', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'arashnrim-tp..goreleaser.yaml'))
		// No project_name field — name should be undefined
		expect(meta.name).toBeUndefined()
		// But description, license, etc. should still be extracted
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
	})
})

// ─── Pattern matching ───

describe('GoReleaser parser — pattern matching', () => {
	it('should match .goreleaser.yml', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('.goreleaser.yml')?.name).toBe('goreleaser')
	})

	it('should match .goreleaser.yaml', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('.goreleaser.yaml')?.name).toBe('goreleaser')
	})

	it('should match goreleaser.yml (without dot prefix)', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('goreleaser.yml')?.name).toBe('goreleaser')
	})

	it('should match goreleaser.yaml (without dot prefix)', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('goreleaser.yaml')?.name).toBe('goreleaser')
	})

	it('should not match unrelated YAML files', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('config.yaml')?.name).not.toBe('goreleaser')
	})
})
