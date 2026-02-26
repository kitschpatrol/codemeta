import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateFromFiles } from '../src/lib/generate.js'
import {
	codemetapyAvailable,
	compareCanonical,
	compareJson,
	formatCanonicalDiff,
	formatJsonDiff,
	isCanonicalMatch,
	isJsonMatch,
	runCodemetapy,
} from './compare-helper.js'

const fixtureDirectory = resolve(import.meta.dirname, 'fixtures/pyproject')

const fixtures = readdirSync(fixtureDirectory).filter((f) => f.endsWith('.toml'))

describe('Python — codemetapy parity', { timeout: 30_000 }, async () => {
	const available = await codemetapyAvailable()

	describe('canonical (RDF)', () => {
		it.skipIf(!available).each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const ours = (await generateFromFiles([filePath])) as Record<string, unknown>

			const temporaryPath = join(mkdtempSync(join(tmpdir(), 'codemeta-')), 'pyproject.toml')
			copyFileSync(filePath, temporaryPath)
			const theirs = await runCodemetapy(temporaryPath)
			if (!theirs) return

			const diff = await compareCanonical(ours, theirs)
			expect(isCanonicalMatch(diff), `Differences:\n${formatCanonicalDiff(diff)}`).toBe(true)
		})
	})

	describe('JSON', () => {
		it.skipIf(!available).each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const ours = (await generateFromFiles([filePath])) as Record<string, unknown>

			const temporaryPath = join(mkdtempSync(join(tmpdir(), 'codemeta-')), 'pyproject.toml')
			copyFileSync(filePath, temporaryPath)
			const theirs = await runCodemetapy(temporaryPath)
			if (!theirs) return

			const diff = compareJson(ours, theirs)
			expect(isJsonMatch(diff), `Differences:\n${formatJsonDiff(diff)}`).toBe(true)
		})
	})
})
