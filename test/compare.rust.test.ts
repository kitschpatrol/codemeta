import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
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

const fixtureDirectory = resolve(import.meta.dirname, 'fixtures/cargo')

// Fixtures with known codemetapy bugs or inherently ambiguous data
const KNOWN_ISSUES = new Set<string>([
	// Codemetapy outputs GPL-3.0-only for license "LGPL-3.0" (drops the "L")
	'0x676e67-wreq-util.Cargo.toml',
	// Author "The Rust Project Developers" — ambiguous first/last name split
	'zoxc-rcb.Cargo.toml',
])

const fixtures = readdirSync(fixtureDirectory)
	.filter((f) => f.endsWith('.toml'))
	.filter((f) => !KNOWN_ISSUES.has(f))

describe('Rust — codemetapy parity', { timeout: 30_000 }, async () => {
	const available = await codemetapyAvailable()

	describe('canonical (RDF)', () => {
		it.skipIf(!available).each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const ours = (await generateFromFiles([filePath])) as Record<string, unknown>

			const theirs = await runCodemetapy(filePath, 'rust')
			if (!theirs) return

			const diff = await compareCanonical(ours, theirs)
			expect(isCanonicalMatch(diff), `Differences:\n${formatCanonicalDiff(diff)}`).toBe(true)
		})
	})

	describe('JSON', () => {
		it.skipIf(!available).each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const ours = (await generateFromFiles([filePath])) as Record<string, unknown>

			const theirs = await runCodemetapy(filePath, 'rust')
			if (!theirs) return

			const diff = compareJson(ours, theirs)
			expect(isJsonMatch(diff), `Differences:\n${formatJsonDiff(diff)}`).toBe(true)
		})
	})
})
