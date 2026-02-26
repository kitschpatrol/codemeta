/* eslint-disable ts/no-unsafe-type-assertion */

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateFromFiles } from '../src/lib/generate.js'

const fixtureDirectory = resolve(import.meta.dirname, 'fixtures/publiccode')

// Fixtures with known issues (malformed YAML, templates, etc.)
const KNOWN_ISSUES = new Set<string>([
	// Url field contains YAML escape \b (backspace) making it garbage: "https:\bult.bz"
	'checkiecheck-frank4sander.publiccode.yaml',
	// Invalid date "2021-19-02" (month 19) causes issues in some parsers
	'conductionnl-education-component.publiccode.yaml',
	// Template file with {{ cookiecutter }} placeholders — YAML parses name as object
	'wearefrank-skeleton.publiccode.yaml',
])

const fixtures = readdirSync(fixtureDirectory)
	.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
	.filter((f) => !KNOWN_ISSUES.has(f))

describe('publiccode.yml — well-formed output', () => {
	describe('produces valid JSON-LD', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// Must have @context and @type
			expect(result['@context']).toBeDefined()
			expect(result['@type']).toBe('SoftwareSourceCode')

			// Must have a name (all publiccode.yml files require name)
			expect(result.name).toBeDefined()
			expect(typeof result.name).toBe('string')
			expect((result.name as string).length).toBeGreaterThan(0)
		})
	})

	describe('parses license correctly', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// Most publiccode.yml files have a legal.license field
			if (result.license) {
				const licenses = Array.isArray(result.license)
					? (result.license as string[])
					: [result.license as string]
				for (const license of licenses) {
					// Should be a valid SPDX URL
					expect(typeof license).toBe('string')
					expect(license).toMatch(/^http:\/\/spdx\.org\/licenses\//)
				}
			}
		})
	})

	describe('parses development status correctly', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			if (result.developmentStatus) {
				// Should be a repostatus.org URL
				expect(result.developmentStatus).toMatch(/^https:\/\/www\.repostatus\.org\/#/)
			}
		})
	})

	describe('person and organization objects are well-typed', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// Check maintainer objects
			if (result.maintainer) {
				const maintainers = [result.maintainer].flat() as Array<Record<string, unknown>>
				for (const m of maintainers) {
					expect(m['@type']).toBe('Person')
					// Must have at least familyName or givenName
					expect(m.familyName ?? m.givenName ?? m.name).toBeDefined()
				}
			}

			// Check copyrightHolder objects
			if (result.copyrightHolder) {
				const holders = [result.copyrightHolder].flat() as Array<Record<string, unknown>>
				for (const h of holders) {
					expect(['Person', 'Organization']).toContain(h['@type'])
				}
			}

			// Check producer objects
			if (result.producer) {
				const producers = [result.producer].flat() as Array<Record<string, unknown>>
				for (const p of producers) {
					expect(p['@type']).toBe('Organization')
					expect(p.name).toBeDefined()
				}
			}

			// Check contributor objects (from contractors)
			if (result.contributor) {
				const contributors = [result.contributor].flat() as Array<Record<string, unknown>>
				for (const c of contributors) {
					expect(['Person', 'Organization']).toContain(c['@type'])
				}
			}
		})
	})

	describe('dependency objects are well-formed', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			if (result.softwareRequirements) {
				const deps = [result.softwareRequirements].flat() as Array<Record<string, unknown>>
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

			// CodeRepository should be a URL (git:// is also valid for repos)
			if (result.codeRepository) {
				expect(typeof result.codeRepository).toBe('string')
				expect(result.codeRepository as string).toMatch(/^(https?|git):\/\//)
			}

			// Url may be a string or array of strings
			if (result.url) {
				const urls = [result.url].flat() as string[]
				for (const u of urls) {
					expect(typeof u).toBe('string')
					expect(u).toMatch(/^https?:\/\//)
				}
			}

			// RelatedLink should be a URL
			if (result.relatedLink) {
				expect(typeof result.relatedLink).toBe('string')
				expect(result.relatedLink as string).toMatch(/^https?:\/\//)
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

			// DatePublished should look like a date when present (allow single-digit day/month)
			if (result.datePublished) {
				expect(typeof result.datePublished).toBe('string')
				expect(result.datePublished as string).toMatch(/^\d{4}-\d{1,2}-\d{1,2}/)
			}
		})
	})

	describe('array properties contain correct types', () => {
		it.each(fixtures)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const result = (await generateFromFiles([filePath])) as Record<string, unknown>

			// OperatingSystem items should be strings
			if (result.operatingSystem) {
				const os = [result.operatingSystem].flat()
				for (const item of os) {
					expect(typeof item).toBe('string')
				}
			}

			// ApplicationSubCategory items should be strings
			if (result.applicationSubCategory) {
				const cats = [result.applicationSubCategory].flat()
				for (const item of cats) {
					expect(typeof item).toBe('string')
				}
			}

			// Keywords items should be strings
			if (result.keywords) {
				const kw = [result.keywords].flat()
				for (const item of kw) {
					expect(typeof item).toBe('string')
				}
			}

			// FileFormat items should be strings
			if (result.fileFormat) {
				const formats = [result.fileFormat].flat()
				for (const item of formats) {
					expect(typeof item).toBe('string')
				}
			}
		})
	})
})
