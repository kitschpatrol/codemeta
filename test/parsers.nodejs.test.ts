/* eslint-disable ts/no-unsafe-type-assertion */

// @case-police-ignore Typescript, Javascript

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseNodejs } from '../src/lib/parsers/nodejs.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/package')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseNodejs(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('Node.js parser', () => {
	it('should parse package.json', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'proycon-labirinto.package.json'))
		console.log(meta)
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

	it('should extract runtimePlatform from engines', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'proycon-labirinto.package.json'))
		const platforms = Array.isArray(meta.runtimePlatform)
			? meta.runtimePlatform
			: [meta.runtimePlatform]
		expect(platforms).toContain('npm >= 3.0.0')
		expect(platforms).toContain('node >= 6.0.0')
	})

	it('should extract URL references', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'proycon-labirinto.package.json'))
		expect(meta.codeRepository).toBe('https://github.com/proycon/labirinto')
		expect(meta.url).toBe('https://github.com/proycon/labirinto')
		expect(meta.issueTracker).toBe('https://github.com/proycon/labirinto/issues')
	})

	it('should detect TypeScript projects', async () => {
		const meta = await parseToJsonLd(resolve(import.meta.dirname, '..', 'package.json'))
		expect(meta.programmingLanguage).toBe('Typescript')
	})

	it('should construct readme web URL from codeRepository', async () => {
		const readmeFixtures = resolve(import.meta.dirname, 'fixtures/package-readme')
		const meta = await parseToJsonLd(resolve(readmeFixtures, 'github-repo.package.json'))
		expect(meta.readme).toBe('https://github.com/test-org/test-project/blob/HEAD/README.md')
	})

	it('should fall back to readme filename when no codeRepository', async () => {
		const readmeFixtures = resolve(import.meta.dirname, 'fixtures/package-readme')
		const meta = await parseToJsonLd(resolve(readmeFixtures, 'no-repo.package.json'))
		expect(meta.readme).toBe('README.md')
	})
})
