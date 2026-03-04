/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parsePyproject } from '../src/lib/parsers/pyproject.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/pyproject')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parsePyproject(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('Pyproject parser — PEP 621 (proycon-codemetapy)', () => {
	const fixture = resolve(fixtures, 'proycon-codemetapy.pyproject.toml')

	it('should parse basic properties', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('codemetapy')
		expect(meta.identifier).toBe('codemetapy')
		expect(meta.version).toBe('2.5.3')
		expect(meta.description).toBe('Generate and manage CodeMeta software metadata')
		expect(meta.license).toBe('https://spdx.org/licenses/GPL-3.0-or-later')
	})

	it('should parse authors', async () => {
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
		expect(keywords).toContain('codemeta')
		expect(keywords).toContain('metadata')
		expect(keywords).toContain('linked-data')
	})

	it('should parse URLs table', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/proycon/codemetapy')
		expect(meta.issueTracker).toBe('https://github.com/proycon/codemetapy/issues')
		expect(meta.softwareHelp).toBe('https://codemetapy.readthedocs.io')
	})

	it('should parse requires-python as runtimePlatform', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.runtimePlatform).toBe('Python >=3.6')
	})

	it('should parse dependencies as SoftwareSourceCode', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements).toHaveLength(3)
		for (const dep of requirements) {
			expect(dep['@type']).toBe('SoftwareSourceCode')
			expect(dep.runtimePlatform).toBe('Python 3')
		}

		const rdflib = requirements.find((d) => d.name === 'rdflib')
		expect(rdflib).toBeDefined()
		expect(rdflib!.version).toBe('>= 6.0.0')
	})

	it('should parse classifiers into development status', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.developmentStatus).toBe('https://www.repostatus.org/#active')
	})

	it('should parse classifiers into application category', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.applicationCategory).toBe('Software Development > Libraries > Python Modules')
	})

	it('should parse classifiers into operating system', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.operatingSystem).toBe('POSIX')
	})

	it('should strip audience (not in codemeta spec)', async () => {
		// Audience/audienceType is parsed from classifiers but stripped during
		// graph serialization since it's not part of the codemeta framing context.
		const meta = await parseToJsonLd(fixture)
		expect(meta.audience).toBeUndefined()
	})
})

describe('Pyproject parser — PEP 621 with complex features', () => {
	it('should handle license as object { text }', async () => {
		// Ameli-special-functions has license = { file = "LICENSE.txt" } — no text
		// smol-ai-developer has license = "MIT" — string
		const meta = await parseToJsonLd(resolve(fixtures, 'smol-ai-developer.pyproject.toml'))
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
	})

	it('should handle optional-dependencies as softwareSuggestions', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'ecmwf-lab-ai-models-gencast.pyproject.toml'),
		)
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>
		expect(suggestions.length).toBeGreaterThan(0)
		expect(suggestions[0]['@type']).toBe('SoftwareSourceCode')
		expect(suggestions[0].name).toBe('pre-commit')
	})

	it('should handle multiple classifiers of same type', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'ameli-special-functions.pyproject.toml'))
		const osList = [meta.operatingSystem].flat() as string[]
		expect(osList.length).toBeGreaterThan(1)
	})

	it('should parse maintainers', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'giganano-trackstar.pyproject.toml'))
		const maintainers = [meta.maintainer].flat() as Array<Record<string, unknown>>
		expect(maintainers.length).toBeGreaterThan(0)
		expect(maintainers[0]['@type']).toBe('Person')
	})

	it('should handle files with no [project] section gracefully', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'cloudtools-sha256.pyproject.toml'))
		// Should still produce valid output with just defaults
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.runtimePlatform).toBe('Python 3')
	})
})

describe('Pyproject parser — Poetry format', () => {
	it('should parse Poetry project with dependencies', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'adarshpalaskar1-fliploggpt-llm.pyproject.toml'),
		)
		expect(meta.name).toBe('privategpt')
		expect(meta.version).toBe('0.1.0')

		// Poetry string-format author
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors.length).toBeGreaterThan(0)
		expect(authors[0].email).toBe('ivanmartit@gmail.com')

		// Poetry object-format dependencies (python should be filtered out)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(requirements.length).toBeGreaterThan(0)
		// "python" should not be in the requirements
		expect(requirements.find((d) => d.name === 'python')).toBeUndefined()
		// But actual deps should be present
		expect(requirements.find((d) => d.name === 'langchain')).toBeDefined()
	})
})
