import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { codemeta, CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseReadme } from '../src/lib/parsers/readme.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/readme')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseReadme(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('README parser — H1 extraction', () => {
	it('should extract H1 heading as name', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, '74th-qmk-firmware-sparrow-keyboard.readme.md'),
		)
		expect(meta.name).toBe('sparrow60c')
	})

	it('should extract H1 from readme with leading image', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'bunnycou-odinproject.readme.md'))
		expect(meta.name).toBe('JavaScript30')
	})

	it('should extract short H1 heading', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'defrisk0-srg0z10.readme.md'))
		expect(meta.name).toBe('SGE')
	})

	it('should not set name when there is no H1 heading', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, '0apocalypse0-ecommerceproject.readme.md'))
		expect(meta.name).toBeUndefined()
	})
})

describe('README parser — readme property emission', () => {
	it('should emit readme filename when no codeRepository is set', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, '74th-qmk-firmware-sparrow-keyboard.readme.md'),
		)
		expect(meta.readme).toBe('74th-qmk-firmware-sparrow-keyboard.readme.md')
	})

	it('should emit web URL when GitHub codeRepository is set', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))
		graph.addUrl(subject, schema('codeRepository'), 'https://github.com/example/repo')

		await parseReadme(
			resolve(fixtures, '74th-qmk-firmware-sparrow-keyboard.readme.md'),
			graph,
			subject,
			crosswalk,
		)

		const meta = await graph.toJsonLd(SUBJECT)
		expect(meta.readme).toBe(
			'https://github.com/example/repo/blob/HEAD/74th-qmk-firmware-sparrow-keyboard.readme.md',
		)
	})

	it('should not override an existing readme', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))
		graph.addUrl(subject, codemeta('readme'), 'https://example.com/existing-readme')

		await parseReadme(
			resolve(fixtures, '74th-qmk-firmware-sparrow-keyboard.readme.md'),
			graph,
			subject,
			crosswalk,
		)

		const meta = await graph.toJsonLd(SUBJECT)
		expect(meta.readme).toBe('https://example.com/existing-readme')
	})
})

describe('README parser — lower precedence than other parsers', () => {
	it('should not override an existing name', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))

		// Simulate another parser having already set a name
		graph.addString(subject, schema('name'), 'existing-name')

		await parseReadme(
			resolve(fixtures, '74th-qmk-firmware-sparrow-keyboard.readme.md'),
			graph,
			subject,
			crosswalk,
		)

		const meta = await graph.toJsonLd(SUBJECT)
		expect(meta.name).toBe('existing-name')
	})
})

describe('README parser — pattern matching', () => {
	it('should match README.md via findParser', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('README.md')).toBeDefined()
		expect(findParser('README.md')!.name).toBe('readme')
	})

	it('should match readme.txt', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('readme.txt')).toBeDefined()
		expect(findParser('readme.txt')!.name).toBe('readme')
	})

	it('should match bare README', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('README')).toBeDefined()
		expect(findParser('README')!.name).toBe('readme')
	})

	it('should match readme.rst', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('readme.rst')).toBeDefined()
	})

	it('should not match unrelated files', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('readme-helper.js')).toBeUndefined()
	})
})
