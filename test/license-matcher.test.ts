import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import spdxLicenseList from 'spdx-license-list/full.js'
import { describe, expect, it } from 'vitest'
import { identifyLicense } from '../src/lib/utilities/license-matcher.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')

describe('license matcher — known licenses', () => {
	it('should identify standard MIT license text', () => {
		const text = readFileSync(resolve(fixtures, 'licence/ashuk032-8secread.licence'), 'utf8')
		const match = identifyLicense(text)
		expect(match).toBeDefined()
		expect(match!.spdxId).toBe('MIT')
		expect(match!.confidence).toBeGreaterThan(0.9)
	})

	it('should identify MIT with many copyright holders', () => {
		const text = readFileSync(resolve(fixtures, 'license/socketry-async.license.md'), 'utf8')
		const match = identifyLicense(text)
		expect(match).toBeDefined()
		expect(match!.spdxId).toBe('MIT')
		expect(match!.confidence).toBeGreaterThan(0.85)
	})

	it('should identify Unlicense text', () => {
		const text = readFileSync(
			resolve(fixtures, 'unlicense/alex-free-alex-free-github-io.unlicense.md'),
			'utf8',
		)
		const match = identifyLicense(text)
		expect(match).toBeDefined()
		expect(match!.spdxId).toBe('Unlicense')
		expect(match!.confidence).toBeGreaterThan(0.95)
	})

	it('should identify AGPL-3.0 from full text', () => {
		const text = readFileSync(
			resolve(fixtures, 'copying/callofduty4x-cod4x-server.copying.md'),
			'utf8',
		)
		const match = identifyLicense(text)
		expect(match).toBeDefined()
		expect(match!.spdxId).toBe('AGPL-3.0-only')
		expect(match!.confidence).toBeGreaterThan(0.9)
	})
})

describe('license matcher — spdx-license-list exhaustive', () => {
	// Some SPDX entries share identical or near-identical text and are
	// indistinguishable by text matching alone (e.g. -only vs -or-later,
	// invariants vs no-invariants, RFN vs no-RFN, exception variants).
	// Group these into equivalence families — any match within the same
	// family is accepted.
	const SAME_TEXT_FAMILIES: string[][] = [
		['AGPL-1.0', 'AGPL-1.0-only', 'AGPL-1.0-or-later'],
		['AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later'],
		['GPL-1.0', 'GPL-1.0-only', 'GPL-1.0-or-later'],
		['GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later'],
		['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later'],
		['LGPL-2.0', 'LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.0+'],
		['LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-2.1+'],
		['LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'LGPL-3.0+'],
		[
			'GFDL-1.1',
			'GFDL-1.1-invariants-only',
			'GFDL-1.1-invariants-or-later',
			'GFDL-1.1-no-invariants-only',
			'GFDL-1.1-no-invariants-or-later',
			'GFDL-1.1-only',
			'GFDL-1.1-or-later',
		],
		[
			'GFDL-1.2',
			'GFDL-1.2-invariants-only',
			'GFDL-1.2-invariants-or-later',
			'GFDL-1.2-no-invariants-only',
			'GFDL-1.2-no-invariants-or-later',
			'GFDL-1.2-only',
			'GFDL-1.2-or-later',
		],
		[
			'GFDL-1.3',
			'GFDL-1.3-invariants-only',
			'GFDL-1.3-invariants-or-later',
			'GFDL-1.3-no-invariants-only',
			'GFDL-1.3-no-invariants-or-later',
			'GFDL-1.3-only',
			'GFDL-1.3-or-later',
		],
		['OFL-1.0', 'OFL-1.0-RFN', 'OFL-1.0-no-RFN'],
		['OFL-1.1', 'OFL-1.1-RFN', 'OFL-1.1-no-RFN'],
		['CAL-1.0', 'CAL-1.0-Combined-Work-Exception'],
		['MPL-2.0', 'MPL-2.0-no-copyleft-exception'],
		['StandardML-NJ', 'SMLNJ'],
	]

	const familyOf = new Map<string, Set<string>>()
	for (const family of SAME_TEXT_FAMILIES) {
		const group = new Set(family)
		for (const id of family) {
			familyOf.set(id, group)
		}
	}

	function isAcceptable(expected: string, got: string): boolean {
		if (expected === got) return true
		const family = familyOf.get(expected)
		return family?.has(got) ?? false
	}

	it('should correctly identify every spdx-license-list entry from its own text', () => {
		const mismatches: Array<{ expected: string; got: string | undefined }> = []
		const noMatch: string[] = []

		for (const [spdxId, entry] of Object.entries(spdxLicenseList)) {
			const match = identifyLicense(entry.licenseText)
			if (!match) {
				noMatch.push(spdxId)
			} else if (!isAcceptable(spdxId, match.spdxId)) {
				mismatches.push({ expected: spdxId, got: match.spdxId })
			}
		}

		const failures = [
			...noMatch.map((id) => `  no match: ${id}`),
			...mismatches.map((m) => `  ${m.expected} → ${m.got}`),
		]

		expect(failures, `Failed licenses:\n${failures.join('\n')}`).toHaveLength(0)
	}, 600_000)
})

describe('license matcher — edge cases', () => {
	it('should return undefined for empty text', () => {
		expect(identifyLicense('')).toBeUndefined()
	})

	it('should return undefined for non-license text', () => {
		const result = identifyLicense('Hello world, this is not a license file.')
		expect(result).toBeUndefined()
	})
})
