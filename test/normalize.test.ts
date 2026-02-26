import { describe, expect, it } from 'vitest'
import { licenseToSpdx, statusToRepostatus } from '../src/lib/normalize.js'

describe('licenseToSpdx', () => {
	it('should convert MIT to SPDX URI', () => {
		expect(licenseToSpdx('MIT')).toBe('http://spdx.org/licenses/MIT')
	})

	it('should convert Apache-2.0 to SPDX URI', () => {
		expect(licenseToSpdx('Apache-2.0')).toBe('http://spdx.org/licenses/Apache-2.0')
	})

	it('should convert GPL-3.0+ to or-later', () => {
		expect(licenseToSpdx('GPL-3.0+')).toBe('http://spdx.org/licenses/GPL-3.0-or-later')
	})

	it('should normalize https to http for SPDX URIs', () => {
		expect(licenseToSpdx('https://spdx.org/licenses/MIT')).toBe('http://spdx.org/licenses/MIT')
	})

	it('should pass through already-valid SPDX URIs', () => {
		expect(licenseToSpdx('http://spdx.org/licenses/MIT')).toBe('http://spdx.org/licenses/MIT')
	})

	it('should handle full license names', () => {
		expect(licenseToSpdx('GNU General Public License v3')).toBe(
			'http://spdx.org/licenses/GPL-3.0-or-later',
		)
	})

	it('should resolve deprecated GPL-3.0 short form', () => {
		expect(licenseToSpdx('http://spdx.org/licenses/GPL-3.0')).toBe(
			'http://spdx.org/licenses/GPL-3.0-only',
		)
	})

	it('should handle OSI URLs', () => {
		expect(licenseToSpdx('https://opensource.org/licenses/MIT')).toBe(
			'http://spdx.org/licenses/MIT',
		)
	})

	it('should return unknown licenses as-is', () => {
		expect(licenseToSpdx('SomeProprietary-1.0')).toBe('SomeProprietary-1.0')
	})
})

describe('statusToRepostatus', () => {
	it('should convert active to URI', () => {
		expect(statusToRepostatus('active')).toBe('https://www.repostatus.org/#active')
	})

	it('should convert Python classifier to URI', () => {
		expect(statusToRepostatus('5 - Production/Stable')).toBe('https://www.repostatus.org/#active')
	})

	it('should convert beta to active when released', () => {
		expect(statusToRepostatus('4 - beta', true)).toBe('https://www.repostatus.org/#active')
	})

	it('should convert beta to wip when not released', () => {
		expect(statusToRepostatus('4 - beta')).toBe('https://www.repostatus.org/#wip')
	})

	it('should return undefined for unknown status', () => {
		expect(statusToRepostatus('foobar')).toBeUndefined()
	})
})
