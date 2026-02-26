/**
 * License text matcher using Dice coefficient on bigrams.
 * Compares input text against the SPDX license list to identify the best match.
 */

import spdxLicenseList from 'spdx-license-list/full.js'

/** Minimum similarity score to consider a match */
const CONFIDENCE_THRESHOLD = 0.75

/** Result of a license text match */
type LicenseMatch = {
	confidence: number
	spdxId: string
}

/**
 * Strip YAML front matter (--- delimited blocks at the start of a file).
 */
function stripFrontMatter(text: string): string {
	if (text.startsWith('---')) {
		const end = text.indexOf('---', 3)
		if (end !== -1) {
			return text.slice(end + 3)
		}
	}

	return text
}

/**
 * Normalize license text for comparison.
 * Follows SPDX matching guidelines: collapse whitespace, strip copyright lines,
 * remove URLs, lowercase.
 */
function normalizeText(text: string): string {
	return (
		text
			// Remove markdown headings
			.replaceAll(/^#+\s+/gm, '')
			// Remove copyright lines (they vary per project, may span multiple formats)
			.replaceAll(/^copyright.*$/gim, '')
			// Remove markdown table rows (contributor tables in COPYING files)
			.replaceAll(/^\|.*\|$/gm, '')
			// Remove markdown table separators
			.replaceAll(/^[-|:\s]+$/gm, '')
			// Remove common URL patterns
			.replaceAll(/https?:\/\/\S+/g, '')
			// Remove email-like patterns
			.replaceAll(/\S+@\S+/g, '')
			// Remove markdown link/image syntax leftovers
			.replaceAll(/[[\]()]/g, ' ')
			// Collapse whitespace
			.replaceAll(/\s+/g, ' ')
			.trim()
			.toLowerCase()
	)
}

/**
 * Normalize input text (user-provided license file).
 * Applies additional cleanup beyond what reference texts need.
 */
function normalizeInput(text: string): string {
	return normalizeText(stripFrontMatter(text))
}

/**
 * Compute bigrams (2-character substrings) of a string.
 */
function bigrams(text: string): Map<string, number> {
	const map = new Map<string, number>()
	for (let i = 0; i < text.length - 1; i++) {
		const pair = text.slice(i, i + 2)
		map.set(pair, (map.get(pair) ?? 0) + 1)
	}

	return map
}

/** Pre-computed normalized license texts with cached bigrams, built lazily */
type NormalizedLicense = {
	bigramsMap: Map<string, number>
	normalized: string
	spdxId: string
	totalBigrams: number
}

let normalizedLicenses: NormalizedLicense[] | undefined

function getNormalizedLicenses(): NormalizedLicense[] {
	normalizedLicenses ??= Object.entries(spdxLicenseList).map(([spdxId, entry]) => {
		const normalized = normalizeText(entry.licenseText)
		return {
			bigramsMap: bigrams(normalized),
			normalized,
			spdxId,
			totalBigrams: normalized.length - 1,
		}
	})

	return normalizedLicenses
}

/**
 * Compute the Dice coefficient using pre-computed bigrams for one side.
 */
function diceCoefficientCached(
	inputBigrams: Map<string, number>,
	inputTotal: number,
	refBigrams: Map<string, number>,
	refTotal: number,
): number {
	let intersection = 0
	for (const [pair, countA] of inputBigrams) {
		const countB = refBigrams.get(pair)
		if (countB !== undefined) {
			intersection += Math.min(countA, countB)
		}
	}

	return (2 * intersection) / (inputTotal + refTotal)
}

/**
 * Identify the SPDX license that best matches the given text.
 * Returns the best match with confidence score, or undefined if no match
 * exceeds the confidence threshold.
 */
export function identifyLicense(text: string): LicenseMatch | undefined {
	const normalizedInput = normalizeInput(text)

	if (normalizedInput.length < 2) return undefined

	const inputBigramsMap = bigrams(normalizedInput)
	const inputTotal = normalizedInput.length - 1

	let bestMatch: LicenseMatch | undefined
	let bestScore = 0

	for (const { bigramsMap, normalized, spdxId, totalBigrams } of getNormalizedLicenses()) {
		if (normalizedInput === normalized) {
			return { confidence: 1, spdxId }
		}

		const score = diceCoefficientCached(inputBigramsMap, inputTotal, bigramsMap, totalBigrams)
		if (score > bestScore) {
			bestScore = score
			bestMatch = { confidence: score, spdxId }
		}
	}

	if (bestMatch && bestMatch.confidence >= CONFIDENCE_THRESHOLD) {
		return bestMatch
	}

	return undefined
}
