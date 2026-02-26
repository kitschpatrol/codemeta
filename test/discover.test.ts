import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discover } from '../src/lib/discover.js'

describe('discover', () => {
	it('should discover package.json in repo root', async () => {
		const root = resolve(import.meta.dirname, '..')
		const files = await discover(root)
		expect(files.some((file) => file.parserName === 'nodejs')).toBe(true)
	})

	it('should discover test fixtures', async () => {
		const fixtures = resolve(import.meta.dirname, 'fixtures')
		const files = await discover(fixtures, true)
		expect(files.length).toBeGreaterThan(0)
	})

	it('should sort by priority', async () => {
		const fixtures = resolve(import.meta.dirname, 'fixtures')
		const files = await discover(fixtures, true)
		for (let index = 1; index < files.length; index++) {
			expect(files[index].priority).toBeGreaterThanOrEqual(files[index - 1].priority)
		}
	})

	it('should respect exclusions', async () => {
		const root = resolve(import.meta.dirname, '..')
		const files = await discover(root, false, ['package.json'])
		expect(files.some((file) => file.parserName === 'nodejs')).toBe(false)
	})

	describe('codemeta filtering', () => {
		it('should exclude codemeta.json when primary sources exist', async () => {
			const directory = mkdtempSync(join(tmpdir(), 'codemeta-test-'))
			writeFileSync(join(directory, 'package.json'), '{"name":"test"}')
			writeFileSync(
				join(directory, 'codemeta.json'),
				'{"@context":"https://w3id.org/codemeta/3.1"}',
			)

			const files = await discover(directory)
			expect(files.some((f) => f.parserName === 'nodejs')).toBe(true)
			expect(files.some((f) => f.parserName === 'jsonld')).toBe(false)
		})

		it('should include codemeta.json when no primary sources exist', async () => {
			const directory = mkdtempSync(join(tmpdir(), 'codemeta-test-'))
			writeFileSync(
				join(directory, 'codemeta.json'),
				'{"@context":"https://w3id.org/codemeta/3.1"}',
			)
			writeFileSync(join(directory, 'LICENSE'), 'MIT License')

			const files = await discover(directory)
			expect(files.some((f) => f.parserName === 'jsonld')).toBe(true)
		})

		it('should include codemeta.json when only codemeta.json exists', async () => {
			const directory = mkdtempSync(join(tmpdir(), 'codemeta-test-'))
			writeFileSync(
				join(directory, 'codemeta.json'),
				'{"@context":"https://w3id.org/codemeta/3.1"}',
			)

			const files = await discover(directory)
			expect(files.some((f) => f.parserName === 'jsonld')).toBe(true)
		})

		it('should include codemeta.json with retain flag even when primary sources exist', async () => {
			const directory = mkdtempSync(join(tmpdir(), 'codemeta-test-'))
			writeFileSync(join(directory, 'package.json'), '{"name":"test"}')
			writeFileSync(
				join(directory, 'codemeta.json'),
				'{"@context":"https://w3id.org/codemeta/3.1"}',
			)

			const files = await discover(directory, false, [], true)
			expect(files.some((f) => f.parserName === 'nodejs')).toBe(true)
			expect(files.some((f) => f.parserName === 'jsonld')).toBe(true)
		})

		it('should exclude codemeta.json in repo root by default', async () => {
			const root = resolve(import.meta.dirname, '..')
			const files = await discover(root)
			expect(files.some((f) => f.parserName === 'nodejs')).toBe(true)
			expect(files.some((f) => f.parserName === 'jsonld')).toBe(false)
		})
	})
})
