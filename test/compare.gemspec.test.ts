/* eslint-disable ts/no-unsafe-type-assertion */

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateFromFiles } from '../src/lib/generate.js'

const fixtureDirectory = resolve(import.meta.dirname, 'fixtures/gemspec')

// Fixtures with known issues (malformed Ruby, templates, etc.)
const KNOWN_ISSUES = new Set<string>([
	// Empty gemspec filename — name extracts as empty string
	'agileventures-project-metric-github..gemspec',
	'aokpower-flowlink-data..gemspec',
	'baasile-io-baasile-io..gemspec',
	// Non-standard Working.gemspec() format — not a Gem::Specification.new block
	'peopleadmin-tweemux..gemspec',
	// Spec.name = File.basename(Dir.pwd) — dynamic expression, can't extract
	'sorbits-glim.glim-seo-tag.gemspec',
	'thegiftsproject-creators..gemspec',
	'wied03-bswtech-jenkins-gem..gemspec',
])

const fixtures = readdirSync(fixtureDirectory)
	.filter((f) => f.endsWith('.gemspec'))
	.filter((f) => !KNOWN_ISSUES.has(f))

describe('gemspec — well-formed output', () => {
	describe('produces valid JSON-LD', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// Must have @context and @type
			expect(result['@context']).toBeDefined()
			expect(result['@type']).toBe('SoftwareSourceCode')

			// Must have a name (all gemspecs should have spec.name)
			expect(result.name).toBeDefined()
			expect(typeof result.name).toBe('string')
			expect((result.name as string).length).toBeGreaterThan(0)
		})
	})

	describe('parses license correctly', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			if (result.license) {
				const licenses = Array.isArray(result.license)
					? (result.license as string[])
					: [result.license as string]
				for (const license of licenses) {
					expect(typeof license).toBe('string')
					// License should be a valid SPDX URL or a non-empty string
					// (some gemspecs use non-SPDX values like "Public Domain" or "Ruby")
					expect(license.length).toBeGreaterThan(0)
				}
			}
		})
	})

	describe('author objects are well-typed', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			if (result.author) {
				const authors = [result.author].flat() as Array<Record<string, unknown>>
				for (const a of authors) {
					expect(a['@type']).toBe('Person')
					// Must have at least familyName or givenName
					expect(a.familyName ?? a.givenName ?? a.name).toBeDefined()
				}
			}
		})
	})

	describe('dependency objects are well-formed', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// SoftwareRequirements (runtime deps)
			if (result.softwareRequirements) {
				const deps = [result.softwareRequirements].flat() as Array<Record<string, unknown>>
				for (const dep of deps) {
					expect(dep.name).toBeDefined()
					expect(typeof dep.name).toBe('string')
				}
			}

			// SoftwareSuggestions (dev deps)
			if (result.softwareSuggestions) {
				const deps = [result.softwareSuggestions].flat() as Array<Record<string, unknown>>
				for (const dep of deps) {
					expect(dep.name).toBeDefined()
					expect(typeof dep.name).toBe('string')
				}
			}
		})
	})

	describe('URL properties are valid URLs', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// CodeRepository should be a URL
			if (result.codeRepository) {
				expect(typeof result.codeRepository).toBe('string')
				expect(result.codeRepository as string).toMatch(/^https?:\/\//)
			}

			// Should be a URL
			if (result.url) {
				const urls = [result.url].flat() as string[]
				for (const u of urls) {
					expect(typeof u).toBe('string')
					expect(u).toMatch(/^https?:\/\//)
				}
			}
		})
	})

	describe('string properties are non-empty', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// Description should be non-empty when present
			if (result.description) {
				expect(typeof result.description).toBe('string')
				expect((result.description as string).trim().length).toBeGreaterThan(0)
			}

			// Version should be non-empty when present
			if (result.version) {
				expect(typeof result.version).toBe('string')
				expect((result.version as string).trim().length).toBeGreaterThan(0)
			}

			// ProgrammingLanguage should be Ruby
			if (result.programmingLanguage) {
				const langs = [result.programmingLanguage].flat() as string[]
				expect(langs).toContain('Ruby')
			}
		})
	})

	describe('runtimePlatform properties are strings', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			if (result.runtimePlatform) {
				const platforms = [result.runtimePlatform].flat()
				for (const item of platforms) {
					expect(typeof item).toBe('string')
				}
			}
		})
	})
})
