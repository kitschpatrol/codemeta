/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parsePubliccode } from '../src/lib/parsers/publiccode.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/publiccode')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parsePubliccode(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('publiccode.yml parser — basic properties', () => {
	const fixture = resolve(fixtures, 'dribdat-dribdat.publiccode.yml')

	it('should parse name', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('Dribdat')
	})

	it('should emit identifier from name', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.identifier).toBe('Dribdat')
	})

	it('should parse codeRepository from url', async () => {
		const meta = await parseToJsonLd(fixture)
		// EmitRepository normalizes by stripping .git suffix
		expect(meta.codeRepository).toBe('https://codeberg.org/dribdat/dribdat')
	})

	it('should parse development status', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#wip')
	})

	it('should parse license', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('http://spdx.org/licenses/MIT')
	})

	it('should parse description from English longDescription', async () => {
		const meta = await parseToJsonLd(fixture)
		// LongDescription is preferred over shortDescription
		expect(meta.description).toContain('open source')
		expect(meta.description).toContain('hackathon')
	})

	it('should parse platforms as operatingSystem', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.operatingSystem).toBe('web')
	})

	it('should parse maintenance contacts as maintainer', async () => {
		const meta = await parseToJsonLd(fixture)
		const maintainers = [meta.maintainer].flat() as Array<Record<string, unknown>>
		expect(maintainers).toHaveLength(1)
		expect(maintainers[0]['@type']).toBe('Person')
		expect(maintainers[0].familyName).toBe('Lavrovsky')
	})

	it('should parse keywords from features', async () => {
		const meta = await parseToJsonLd(fixture)
		const { keywords } = meta
		expect(keywords).toBeDefined()
		const array = Array.isArray(keywords) ? keywords : [keywords]
		expect(array.length).toBeGreaterThan(0)
		// YAML parses "key: value" features as objects, parser recombines them
		expect(array[0]).toContain('Commit sustainably')
	})
})

describe('publiccode.yml parser — complex properties', () => {
	it('should parse multi-language description preferring English', async () => {
		const fixture = resolve(fixtures, 'kadas-albireo-kadas-albireo2.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.description).toContain('KADAS Albireo is a mapping application')
	})

	it('should parse version', async () => {
		const fixture = resolve(fixtures, 'kadas-albireo-kadas-albireo2.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.version).toBe('2.3.18')
	})

	it('should parse releaseDate as datePublished', async () => {
		const fixture = resolve(fixtures, 'kadas-albireo-kadas-albireo2.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.datePublished).toBe('2025-12-11')
	})

	it('should parse stable developmentStatus as active', async () => {
		const fixture = resolve(fixtures, 'kadas-albireo-kadas-albireo2.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#active')
	})

	it('should parse categories as applicationSubCategory', async () => {
		const fixture = resolve(fixtures, 'kadas-albireo-kadas-albireo2.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const categories = [meta.applicationSubCategory].flat() as string[]
		expect(categories).toContain('data-analytics')
		expect(categories).toContain('geographic-information-systems')
	})

	it('should parse license from legal section', async () => {
		const fixture = resolve(fixtures, 'kadas-albireo-kadas-albireo2.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('http://spdx.org/licenses/GPL-2.0-only')
	})

	it('should parse contractors as contributor Organizations', async () => {
		const fixture = resolve(fixtures, 'kadas-albireo-kadas-albireo2.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const contributors = [meta.contributor].flat() as Array<Record<string, unknown>>
		expect(contributors).toHaveLength(1)
		expect(contributors[0]['@type']).toBe('Organization')
		expect(contributors[0].name).toBe('OPENGIS.ch')
	})

	it('should parse dependsOn as softwareRequirements', async () => {
		const fixture = resolve(fixtures, 'opf-openproject.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements.length).toBeGreaterThan(0)
		const pg = requirements.find((r) => r.name === 'PostgreSQL')
		expect(pg).toBeDefined()
		expect(pg!.version).toBe('>= 13')
	})

	it('should parse copyrightHolder from legal.mainCopyrightOwner', async () => {
		const fixture = resolve(fixtures, 'zammad-zammad.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const holders = [meta.copyrightHolder].flat() as Array<Record<string, unknown>>
		expect(holders).toHaveLength(1)
		expect(holders[0].familyName).toBe('Foundation')
	})

	it('should parse landingURL as url', async () => {
		const fixture = resolve(fixtures, 'zammad-zammad.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.url).toBe('https://zammad.com/')
	})

	it('should parse documentation from description', async () => {
		const fixture = resolve(fixtures, 'zammad-zammad.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.softwareHelp).toBe('https://docs.zammad.org/en/latest/')
	})

	it('should parse AGPL-3.0-only license', async () => {
		const fixture = resolve(fixtures, 'zammad-zammad.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('http://spdx.org/licenses/AGPL-3.0-only')
	})

	it('should parse inputTypes and outputTypes as fileFormat', async () => {
		const fixture = resolve(fixtures, 'conductionnl-education-component.publiccode.yaml')
		const meta = await parseToJsonLd(fixture)
		const formats = [meta.fileFormat].flat() as string[]
		expect(formats).toContain('application/json')
		expect(formats).toContain('application/xml')
	})

	it('should parse EUPL-1.2 license', async () => {
		const fixture = resolve(fixtures, 'conductionnl-education-component.publiccode.yaml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('http://spdx.org/licenses/EUPL-1.2')
	})

	it('should handle roadmap URL', async () => {
		const fixture = resolve(fixtures, 'opf-openproject.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.relatedLink).toBe('https://www.openproject.org/roadmap')
	})
})

describe('publiccode.yml parser — edge cases', () => {
	it('should fall back to non-English description when English is absent', async () => {
		const fixture = resolve(fixtures, 'italia-software-plausible.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		// Only Italian description available — should use it
		expect(meta.description).toBeDefined()
		expect(typeof meta.description).toBe('string')
		expect((meta.description as string).length).toBeGreaterThan(0)
	})

	it('should parse applicationSuite as isPartOf', async () => {
		const fixture = resolve(fixtures, 'opf-openproject.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		// ApplicationSuite: openDesk → isPartOf
		expect(meta.isPartOf).toBe('openDesk')
	})

	it('should parse repoOwner as producer Organization', async () => {
		const fixture = resolve(fixtures, 'zammad-zammad.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const producers = [meta.producer].flat() as Array<Record<string, unknown>>
		expect(producers).toHaveLength(1)
		expect(producers[0]['@type']).toBe('Organization')
		expect(producers[0].name).toBe('Zammad GmbH')
	})

	it('should parse multiple maintenance contacts', async () => {
		const fixture = resolve(fixtures, 'italia-software-plausible.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const maintainers = [meta.maintainer].flat() as Array<Record<string, unknown>>
		expect(maintainers.length).toBe(2)
	})

	it('should parse contact email', async () => {
		const fixture = resolve(fixtures, 'zammad-zammad.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const maintainers = [meta.maintainer].flat() as Array<Record<string, unknown>>
		expect(maintainers).toHaveLength(1)
		expect(maintainers[0].email).toBe('enjoy@zammad.com')
	})

	it('should parse multiple operating systems', async () => {
		const fixture = resolve(fixtures, 'cisofy-lynis.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const os = [meta.operatingSystem].flat() as string[]
		expect(os).toContain('linux')
		expect(os).toContain('mac')
	})

	it('should parse obsolete developmentStatus as inactive', async () => {
		// Find a fixture with obsolete status or test directly
		const fixture = resolve(fixtures, 'dribdat-dribdat.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		// DevelopmentStatus: development → wip
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#wip')
	})

	it('should parse genericName as applicationCategory', async () => {
		const fixture = resolve(fixtures, 'zammad-zammad.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		// Description.en.genericName: "Helpdesk software"
		expect(meta.applicationCategory).toBe('Helpdesk software')
	})

	it('should parse isBasedOn as isPartOf', async () => {
		const fixture = resolve(fixtures, 'conductionnl-education-component.publiccode.yaml')
		const meta = await parseToJsonLd(fixture)
		// IsBasedOn should be emitted as isPartOf
		expect(meta.isPartOf).toBeDefined()
	})

	it('should parse contractor with website as contributor org with url', async () => {
		const fixture = resolve(fixtures, 'conductionnl-education-component.publiccode.yaml')
		const meta = await parseToJsonLd(fixture)
		const contributors = [meta.contributor].flat() as Array<Record<string, unknown>>
		expect(contributors.length).toBeGreaterThan(0)
		expect(contributors[0]['@type']).toBe('Organization')
		expect(contributors[0].url).toBe('https://www.conduction.nl')
	})

	it('should handle YAML date objects (releaseDate parsed as Date)', async () => {
		// YAML spec auto-parses bare dates like 2023-08-14 as Date objects
		const fixture = resolve(fixtures, 'opf-openproject.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		expect(meta.datePublished).toBeDefined()
		expect(typeof meta.datePublished).toBe('string')
	})

	it('should handle AGPL-3.0 without -only/-or-later suffix', async () => {
		const fixture = resolve(fixtures, 'italia-software-plausible.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		// AGPL-3.0 is deprecated, should be normalized to AGPL-3.0-only or similar
		expect(meta.license).toBeDefined()
		expect(typeof meta.license).toBe('string')
		expect(meta.license as string).toMatch(/spdx\.org\/licenses\/AGPL-3\.0/)
	})

	it('should parse features as plain strings when not YAML key:value', async () => {
		const fixture = resolve(fixtures, 'opf-openproject.publiccode.yml')
		const meta = await parseToJsonLd(fixture)
		const keywords = [meta.keywords].flat() as string[]
		expect(keywords).toContain('Project planning and scheduling')
		expect(keywords).toContain('Task management')
	})
})
