import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseLicenseFile } from '../src/lib/parsers/license-file.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseLicenseFile(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

// ─── LICENCE fixtures (British spelling) ───

describe('License file parser — LICENCE fixtures', () => {
	it('should detect MIT from ashuk032-8secread.licence', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'licence/ashuk032-8secread.licence'))
		expect(meta.license).toBe('http://spdx.org/licenses/MIT')
	})

	it('should detect MIT from base16-builder-base16-builder.licence.md', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'licence/base16-builder-base16-builder.licence.md'),
		)
		expect(meta.license).toBe('http://spdx.org/licenses/MIT')
	})
})

// ─── LICENSE fixtures ───

describe('License file parser — LICENSE fixtures', () => {
	it('should detect MIT from socketry-async.license.md', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'license/socketry-async.license.md'))
		expect(meta.license).toBe('http://spdx.org/licenses/MIT')
	})
})

// ─── UNLICENSE fixtures ───

describe('License file parser — UNLICENSE fixtures', () => {
	it('should detect Unlicense from alex-free.unlicense.md', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'unlicense/alex-free-alex-free-github-io.unlicense.md'),
		)
		expect(meta.license).toBe('http://spdx.org/licenses/Unlicense')
	})

	it('should detect Unlicense from budecosystem-bud-runtime.unlicense.md', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'unlicense/budecosystem-bud-runtime.unlicense.md'),
		)
		expect(meta.license).toBe('http://spdx.org/licenses/Unlicense')
	})
})

// ─── COPYING fixtures ───

describe('License file parser — COPYING fixtures', () => {
	it('should detect AGPL-3.0-only from callofduty4x-cod4x-server.copying.md', async () => {
		const meta = await parseToJsonLd(
			resolve(fixtures, 'copying/callofduty4x-cod4x-server.copying.md'),
		)
		expect(meta.license).toBe('http://spdx.org/licenses/AGPL-3.0-only')
	})

	it('should not match when COPYING contains description, not license text', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'copying/sfttech-openage.copying.md'))
		// This file describes the license but doesn't contain the actual GPL text
		expect(meta.license).toBeUndefined()
	})
})

// ─── Precedence ───

describe('License file parser — lower precedence than other parsers', () => {
	it('should not override an existing license', async () => {
		const graph = new CodeMetaGraph()
		const subject = namedNode(SUBJECT)
		graph.setType(subject, schema('SoftwareSourceCode'))

		// Simulate another parser having already set a license
		graph.addUrl(subject, schema('license'), 'http://spdx.org/licenses/Apache-2.0')

		await parseLicenseFile(
			resolve(fixtures, 'licence/ashuk032-8secread.licence'),
			graph,
			subject,
			crosswalk,
		)

		const meta = await graph.toJsonLd(SUBJECT)
		expect(meta.license).toBe('http://spdx.org/licenses/Apache-2.0')
	})
})

// ─── Pattern matching ───

describe('License file parser — pattern matching', () => {
	it('should match LICENSE', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('LICENSE')?.name).toBe('license-file')
	})

	it('should match LICENSE.md', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('LICENSE.md')?.name).toBe('license-file')
	})

	it('should match LICENSE.txt', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('LICENSE.txt')?.name).toBe('license-file')
	})

	it('should match LICENCE (British spelling)', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('LICENCE')?.name).toBe('license-file')
	})

	it('should match LICENCE.md', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('LICENCE.md')?.name).toBe('license-file')
	})

	it('should match license (lowercase)', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('license')?.name).toBe('license-file')
	})

	it('should match UNLICENSE', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('UNLICENSE')?.name).toBe('license-file')
	})

	it('should match UNLICENSE.md', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('UNLICENSE.md')?.name).toBe('license-file')
	})

	it('should match unlicense.txt', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('unlicense.txt')?.name).toBe('license-file')
	})

	it('should match COPYING', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('COPYING')?.name).toBe('license-file')
	})

	it('should match COPYING.md', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('COPYING.md')?.name).toBe('license-file')
	})

	it('should match copying.txt', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('copying.txt')?.name).toBe('license-file')
	})
})
