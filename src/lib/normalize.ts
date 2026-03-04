/**
 * License normalization, status normalization, and other value corrections.
 * Uses spdx-correct for license identifier correction and spdx-license-ids for validation.
 */

import spdxCorrect from 'spdx-correct'
import spdxLicenseIds from 'spdx-license-ids' with { type: 'json' }
import { REPOSTATUS_MAP, REPOSTATUS_VALUES } from './constants.js'

const SPDX_BASE = 'https://spdx.org/licenses/'

/** Deprecated SPDX identifiers that should resolve to -only (not -or-later) */
const DEPRECATED_TO_ONLY: Record<string, string> = {
	'AGPL-3.0': 'AGPL-3.0-only',
	'GPL-2.0': 'GPL-2.0-only',
	'GPL-3.0': 'GPL-3.0-only',
	'LGPL-2.0': 'LGPL-2.0-only',
	'LGPL-2.1': 'LGPL-2.1-only',
	'LGPL-3.0': 'LGPL-3.0-only',
}

/** URL patterns and license names that spdx-correct doesn't handle */
const FALLBACK_MAP: Array<[string, string]> = [
	['https://creativecommons.org/licenses/by-sa/4.0', 'CC-BY-SA-4.0'],
	['https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12', 'EUPL-1.2'],
	['European Union Public License 1.1', 'EUPL-1.1'],
	['European Union Public License', 'EUPL-1.2'],
	['Common Public Attribution License', 'CPAL-1.0'],
	['MIT No Attribution', 'MIT-0'],
]

/**
 * Convert a license name, identifier, or URL to a full SPDX URI.
 * Uses spdx-correct for fuzzy matching, with overrides for edge cases.
 */
export function licenseToSpdx(value: string): string {
	// Already a SPDX URI — normalize and return
	if (
		value.startsWith('http://spdx.org/licenses/') ||
		value.startsWith('https://spdx.org/licenses/')
	) {
		const id = value
			.replace('https://spdx.org/licenses/', '')
			.replace('http://spdx.org/licenses/', '')
		if (id in DEPRECATED_TO_ONLY) return SPDX_BASE + DEPRECATED_TO_ONLY[id]
		if (spdxLicenseIds.includes(id)) return SPDX_BASE + id
		const corrected = spdxCorrect(id)
		if (corrected) return SPDX_BASE + corrected
		return SPDX_BASE + id
	}

	// Handle OSI license URLs — extract the identifier and fix deprecated forms
	if (value.startsWith('https://opensource.org/licenses/')) {
		const id = value.slice('https://opensource.org/licenses/'.length)
		if (id in DEPRECATED_TO_ONLY) return SPDX_BASE + DEPRECATED_TO_ONLY[id]
		if (spdxLicenseIds.includes(id)) return SPDX_BASE + id
		const corrected = spdxCorrect(id)
		if (corrected) return SPDX_BASE + corrected
		return SPDX_BASE + id
	}

	// NPM uses "UNLICENSED" to mean "no license granted" — don't let spdx-correct
	// confuse it with the "Unlicense" (public domain dedication)
	if (value === 'UNLICENSED') return value

	// Check fallback map for URLs and names spdx-correct can't handle (substring match)
	for (const [pattern, spdxId] of FALLBACK_MAP) {
		if (value.includes(pattern)) return SPDX_BASE + spdxId
	}

	// If it's already a valid SPDX ID, just prepend the base URI
	if (spdxLicenseIds.includes(value)) return SPDX_BASE + value

	// Try spdx-correct for fuzzy matching
	const corrected = spdxCorrect(value)
	if (corrected) {
		// Compound SPDX expressions (e.g. "MIT OR Apache-2.0") are valid expressions
		// but cannot be turned into a single SPDX URI — return as plain string
		if (corrected.includes(' OR ') || corrected.includes(' AND ')) return corrected
		return SPDX_BASE + corrected
	}

	// Unknown — return as-is
	return value
}

/**
 * Convert a development status string to a repostatus.org URI.
 */
export function statusToRepostatus(value: string, released = false): string | undefined {
	const lower = value.trim().toLowerCase()

	// Already a repostatus value
	if (REPOSTATUS_VALUES.has(lower)) {
		return `https://www.repostatus.org/#${lower}`
	}

	// Map from Python development status classifiers
	if (lower in REPOSTATUS_MAP) {
		let repostatus = REPOSTATUS_MAP[lower]
		// Beta maps to active if released
		if (released && lower.includes('beta') && repostatus === 'wip') {
			repostatus = 'active'
		}

		return `https://www.repostatus.org/#${repostatus}`
	}

	// Already a full repostatus URI
	if (value.includes('repostatus.org')) {
		return value
	}

	return undefined
}
