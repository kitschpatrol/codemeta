/* eslint-disable ts/no-unsafe-type-assertion */

// @case-police-ignore Typescript, Javascript

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseJava } from '../src/lib/parsers/java.js'
import { parseJsonLd } from '../src/lib/parsers/jsonld.js'
import { parseNodejs } from '../src/lib/parsers/nodejs.js'
import { parsePyproject } from '../src/lib/parsers/pyproject.js'
import { parseRust } from '../src/lib/parsers/rust.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(
	parser: typeof parseNodejs,
	filePath: string,
): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parser(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

// ─── Node.js parser (matches Python BuildTest_NpmPackageJSON) ───

describe('Node.js parser', () => {
	it('should parse labirinto.package.json', async () => {
		const meta = await parseToJsonLd(
			parseNodejs,
			resolve(fixtures, 'package/proycon-labirinto.package.json'),
		)

		expect(meta.name).toBe('labirinto')
		expect(meta.version).toBe('0.2.6')
		expect(meta.license).toBe('http://spdx.org/licenses/AGPL-3.0-or-later')
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0].givenName).toBe('Maarten')
		expect(authors[0].familyName).toBe('van Gompel')
		expect(authors[0].email).toBe('proycon@anaproy.nl')
		expect(meta.codeRepository).toBe('https://github.com/proycon/labirinto')
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('portal')
		expect(keywords).toContain('codemeta')
		expect(meta.programmingLanguage).toBe('Javascript')
		expect(meta.softwareRequirements).toBeDefined()
		const requirements = meta.softwareRequirements as unknown[]
		expect(requirements.length).toBeGreaterThan(0)
	})

	// Matches Python BuildTest_NpmPackageJSON test002_basics: runtimePlatform
	it('should extract runtimePlatform from engines', async () => {
		const meta = await parseToJsonLd(
			parseNodejs,
			resolve(fixtures, 'package/proycon-labirinto.package.json'),
		)
		const platforms = Array.isArray(meta.runtimePlatform)
			? meta.runtimePlatform
			: [meta.runtimePlatform]
		expect(platforms).toContain('npm >= 3.0.0')
		expect(platforms).toContain('node >= 6.0.0')
	})

	// Matches Python BuildTest_NpmPackageJSON test003_urlref
	it('should extract URL references', async () => {
		const meta = await parseToJsonLd(
			parseNodejs,
			resolve(fixtures, 'package/proycon-labirinto.package.json'),
		)
		expect(meta.codeRepository).toBe('https://github.com/proycon/labirinto')
		expect(meta.url).toBe('https://github.com/proycon/labirinto')
		expect(meta.issueTracker).toBe('https://github.com/proycon/labirinto/issues')
	})

	it('should detect TypeScript projects', async () => {
		const meta = await parseToJsonLd(
			parseNodejs,
			resolve(import.meta.dirname, '..', 'package.json'),
		)
		expect(meta.programmingLanguage).toBe('Typescript')
	})
})

// ─── Rust parser (matches Python BuildTest_RustCargoToml) ───

describe('Rust parser', () => {
	it('should parse proycon-analiticcl.Cargo.toml', async () => {
		const meta = await parseToJsonLd(
			parseRust,
			resolve(fixtures, 'cargo/proycon-analiticcl.Cargo.toml'),
		)

		expect(meta.name).toBe('analiticcl')
		expect(meta.version).toBe('0.4.5')
		expect(meta.license).toBe('http://spdx.org/licenses/GPL-3.0-or-later')
		expect(meta.programmingLanguage).toBe('Rust')
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0].givenName).toBe('Maarten')
		expect(authors[0].familyName).toBe('van Gompel')
		expect(meta.codeRepository).toBe('https://github.com/proycon/analiticcl')
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('nlp')
		const requirements = meta.softwareRequirements as unknown[]
		expect(requirements).toBeDefined()
		expect(requirements.length).toBe(8)
	})

	// Matches Python BuildTest_RustCargoToml test002_basics: description
	it('should extract description', async () => {
		const meta = await parseToJsonLd(
			parseRust,
			resolve(fixtures, 'cargo/proycon-analiticcl.Cargo.toml'),
		)
		expect(meta.description).toBeDefined()
	})

	// Matches Python BuildTest_RustCargoToml test003_urlref: url and softwareHelp
	it('should extract URL and softwareHelp', async () => {
		const meta = await parseToJsonLd(
			parseRust,
			resolve(fixtures, 'cargo/proycon-analiticcl.Cargo.toml'),
		)
		expect(meta.url).toBe('https://github.com/proycon/analiticcl')
		expect(meta.softwareHelp).toBe('https://docs.rs/analiticcl')
	})
})

// ─── Java parser (matches Python BuildTest_JavaPomXML) ───

describe('Java parser', () => {
	it('should parse widoco.pom.xml', async () => {
		const meta = await parseToJsonLd(parseJava, resolve(fixtures, 'pom/widoco.pom.xml'))

		expect(meta.name).toBe('Widoco')
		expect(meta.version).toBe('1.4.17')
		expect(meta.programmingLanguage).toBe('Java')
		expect(meta.identifier).toBe('es.oeg.widoco')
		const requirements = meta.softwareRequirements as Array<Record<string, unknown>>
		expect(requirements).toBeDefined()
		expect(requirements.length).toBeGreaterThan(0)
		// Check that a known dependency is present
		const owlapi = requirements.find((dependency) => dependency.name === 'owlapi-distribution')
		expect(owlapi).toBeDefined()
		expect(owlapi!.version).toBe('5.1.18')
	})

	// Matches Python BuildTest_JavaPomXML test002_basics: runtimePlatform
	it('should extract runtimePlatform with Java version', async () => {
		const meta = await parseToJsonLd(parseJava, resolve(fixtures, 'pom/widoco.pom.xml'))
		expect(meta.runtimePlatform).toBe('Java 1.8')
	})
})

// ─── JSON-LD parser (matches Python BuildTest_Json) ───

describe('JSON-LD parser', () => {
	// ── languagemachines-frog.codemeta.json (v3 format) ──

	// Matches Python BuildTest_Json test001_sanity
	it('should parse languagemachines-frog.codemeta.json with correct type', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		expect(meta['@type']).toBe('SoftwareSourceCode')
	})

	// Matches Python BuildTest_Json test002_basics
	it('should parse languagemachines-frog.codemeta.json basic properties', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)

		expect(meta.name).toBe('Frog')
		expect(meta.version).toBe('0.26')
		expect(meta.description).toBeDefined()
		expect((meta.description as string).length).toBeGreaterThan(0)
	})

	// Matches Python BuildTest_Json test003_urlref
	it('should parse languagemachines-frog.codemeta.json URL references', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		expect(meta.codeRepository).toBe('https://github.com/LanguageMachines/frog')
		expect(meta.license).toBe('http://spdx.org/licenses/GPL-3.0-only')
		expect(meta.url).toBe('https://languagemachines.github.io/frog')
	})

	// Matches Python BuildTest_Json test004_codemeta_urlref
	it('should parse languagemachines-frog.codemeta.json codemeta URL references', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		const statuses = Array.isArray(meta.developmentStatus)
			? meta.developmentStatus
			: [meta.developmentStatus]
		expect(statuses).toContain('https://www.repostatus.org/#active')
		expect(meta.issueTracker).toBe('https://github.com/LanguageMachines/frog/issues')
		expect(meta.continuousIntegration).toBe('https://travis-ci.org/LanguageMachines/frog')
		expect(meta.readme).toBe('https://github.com/LanguageMachines/frog/blob/master/README.md')
	})

	// Matches Python BuildTest_Json test005_os
	it('should parse languagemachines-frog.codemeta.json operatingSystem', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		const osList = Array.isArray(meta.operatingSystem)
			? meta.operatingSystem
			: [meta.operatingSystem]
		expect(osList).toContain('Linux')
		expect(osList).toContain('BSD')
		expect(osList).toContain('macOS')
	})

	// Matches Python BuildTest_Json test006_keywords
	it('should parse languagemachines-frog.codemeta.json keywords', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('nlp')
		expect(keywords).toContain('dutch')
	})

	// Matches Python BuildTest_Json test007_datecreated
	it('should parse languagemachines-frog.codemeta.json dateCreated', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		expect(meta.dateCreated).toBe('2011-03-31T12:35:01Z+0000')
	})

	// Matches Python BuildTest_Json test008_authors
	it('should parse languagemachines-frog.codemeta.json authors', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		const authors = meta.author as Array<Record<string, unknown>>
		expect(authors).toBeDefined()
		expect(authors.length).toBe(3)

		for (const author of authors) {
			expect(author['@type']).toBe('Person')
			expect(author.givenName).toBeDefined()
			expect(author.familyName).toBeDefined()
			expect(author.email).toBeDefined()
		}

		const maarten = authors.find((a) => a['@id'] === 'https://orcid.org/0000-0002-1046-0006')
		expect(maarten).toBeDefined()
		expect(maarten!.givenName).toBe('Maarten')
		expect(maarten!.familyName).toBe('van Gompel')
		expect(maarten!.email).toBe('proycon@anaproy.nl')
	})

	// Matches Python BuildTest_Json test009_producer
	it('should parse languagemachines-frog.codemeta.json producer', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		expect(meta.producer).toBeDefined()
		const producer = meta.producer as Record<string, unknown>
		expect(producer['@type']).toBe('Organization')
		expect(producer.name).toBe('KNAW Humanities Cluster')
		expect(producer.url).toBe('https://huc.knaw.nl')
	})

	// Matches Python BuildTest_Json test010_softwarehelp
	it('should parse languagemachines-frog.codemeta.json softwareHelp', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		expect(meta.softwareHelp).toBeDefined()
	})

	// Matches Python BuildTest_Json test011_funder
	it('should parse languagemachines-frog.codemeta.json funders', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		const funders = meta.funder as Array<Record<string, unknown>>
		expect(funders).toBeDefined()
		expect(funders.length).toBe(2)
		for (const funder of funders) {
			expect(funder['@type']).toBe('Organization')
		}
	})

	// Matches Python BuildTest_Json test012_proglang
	it('should parse languagemachines-frog.codemeta.json programmingLanguage', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		expect(meta.programmingLanguage).toBeDefined()
	})

	// Matches Python BuildTest_Json test013_targetproduct / isSourceCodeOf
	it('should parse languagemachines-frog.codemeta.json isSourceCodeOf (target products)', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		const targets = meta.isSourceCodeOf as Array<Record<string, unknown>>
		expect(targets).toBeDefined()
		expect(targets.length).toBe(5)

		const libfrog = targets.find((t) => t.name === 'libfrog')
		expect(libfrog).toBeDefined()
		expect(libfrog!['@type']).toBe('SoftwareLibrary')

		const frog = targets.find((t) => t.name === 'frog')
		expect(frog).toBeDefined()
		expect(frog!['@type']).toBe('CommandLineApplication')
		expect(frog!.executableName).toBe('frog')
		expect(frog!.description).toBeDefined()
	})

	// Matches Python BuildTest_Json test002 (identifier field)
	it('should parse languagemachines-frog.codemeta.json identifier', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		expect(meta.identifier).toBeDefined()
	})

	// Matches Python BuildTest_Json softwareRequirements
	it('should parse languagemachines-frog.codemeta.json softwareRequirements', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		const requirements = meta.softwareRequirements as Array<Record<string, unknown>>
		expect(requirements).toBeDefined()
		expect(requirements.length).toBe(7)
		for (const requirement of requirements) {
			expect(requirement['@type']).toBe('SoftwareApplication')
		}
	})

	// ── languagemachines-frog-2.codemeta.json (v2 format, matches Python BuildTest2_Json) ──

	it('should parse languagemachines-frog-2.codemeta.json (v2 format) with v2→v3 renaming', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)

		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBe('Frog')
		expect(meta.version).toBe('0.26')
		expect(meta.description).toBeDefined()
		expect(meta.license).toBe('http://spdx.org/licenses/GPL-3.0-only')
		expect(meta.codeRepository).toBe('https://github.com/LanguageMachines/frog')
		expect(meta.url).toBe('https://languagemachines.github.io/frog')
	})

	it('should rename contIntegration to continuousIntegration in v2 format', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)
		expect(meta.continuousIntegration).toBe('https://travis-ci.org/LanguageMachines/frog')
	})

	it('should rename targetProduct to isSourceCodeOf in v2 format', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)
		const targets = meta.isSourceCodeOf as Array<Record<string, unknown>>
		expect(targets).toBeDefined()
		expect(targets.length).toBe(5)
	})

	it('should parse v2 format authors identically to v3', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toBeDefined()
		expect(authors.length).toBe(3)

		const maarten = authors.find((a) => a['@id'] === 'https://orcid.org/0000-0002-1046-0006')
		expect(maarten).toBeDefined()
		expect(maarten!.givenName).toBe('Maarten')
		expect(maarten!.familyName).toBe('van Gompel')
		expect(maarten!.email).toBe('proycon@anaproy.nl')
	})

	it('should parse v2 format operatingSystem identically to v3', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)
		const osList = Array.isArray(meta.operatingSystem)
			? meta.operatingSystem
			: [meta.operatingSystem]
		expect(osList).toContain('Linux')
		expect(osList).toContain('BSD')
		expect(osList).toContain('macOS')
	})

	it('should parse v2 format keywords identically to v3', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('nlp')
		expect(keywords).toContain('dutch')
	})

	it('should parse v2 format developmentStatus', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)
		const statuses = Array.isArray(meta.developmentStatus)
			? meta.developmentStatus
			: [meta.developmentStatus]
		expect(statuses).toContain('https://www.repostatus.org/#active')
	})

	it('should parse v2 format softwareRequirements', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/languagemachines-frog-2.codemeta.json'),
		)
		const requirements = meta.softwareRequirements as Array<Record<string, unknown>>
		expect(requirements).toBeDefined()
		expect(requirements.length).toBe(7)
		for (const requirement of requirements) {
			expect(requirement['@type']).toBe('SoftwareApplication')
		}
	})

	// ── withid.codemeta.json (matches Python BuildTest_RetainId) ──

	it('should parse withid.codemeta.json and retain @id', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/with-id.codemeta.json'),
		)

		// In graph architecture, the subject is always remapped to our target
		expect(meta['@id']).toBe(SUBJECT)
		expect(meta.name).toBe('test')
		expect(meta.version).toBe('0.1')
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(2)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#active')
	})

	// ── withoutid.codemeta.json ──

	it('should parse withoutid.codemeta.json', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/without-id.codemeta.json'),
		)

		// In graph architecture, the subject is always remapped to our target
		expect(meta['@id']).toBe(SUBJECT)
		expect(meta.name).toBe('test')
		expect(meta.version).toBe('0.1')
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(2)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#inactive')
	})

	// ── proycon-labirinto-harvest.codemeta.json ──

	it('should parse proycon-labirinto-harvest.codemeta.json', async () => {
		const meta = await parseToJsonLd(
			parseJsonLd,
			resolve(fixtures, 'codemeta/proycon-labirinto-harvest.codemeta.json'),
		)

		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#unsupported')
		expect(meta.issueTracker).toBe('https://github.com/proycon/labirinto/issues')
		expect(meta.producer).toBeDefined()
		const producer = meta.producer as Record<string, unknown>
		expect(producer['@type']).toBe('Organization')
		expect(producer.name).toBe('Centre for Language and Speech Technology')
	})
})

// ─── Python parser ───

describe('Python parser', () => {
	it('should parse proycon-codemetapy.pyproject.toml', async () => {
		const meta = await parseToJsonLd(
			parsePyproject,
			resolve(fixtures, 'pyproject/proycon-codemetapy.pyproject.toml'),
		)

		expect(meta.name).toBe('codemetapy')
		expect(meta.version).toBe('2.5.3')
		expect(meta.description).toBe('Generate and manage CodeMeta software metadata')
		expect(meta.license).toBe('http://spdx.org/licenses/GPL-3.0-or-later')
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0].givenName).toBe('Maarten')
		expect(authors[0].familyName).toBe('van Gompel')
		const keywords = Array.isArray(meta.keywords) ? meta.keywords : [meta.keywords]
		expect(keywords).toContain('codemeta')
		expect(meta.codeRepository).toBe('https://github.com/proycon/codemetapy')
		expect(meta.issueTracker).toBe('https://github.com/proycon/codemetapy/issues')
		expect(meta.softwareHelp).toBe('https://codemetapy.readthedocs.io')
		const requirements = meta.softwareRequirements as unknown[]
		expect(requirements).toBeDefined()
		expect(requirements.length).toBe(3)
	})
})
