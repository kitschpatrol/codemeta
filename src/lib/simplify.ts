/**
 * Runtime transform from {@link CodeMeta} → {@link CodeMetaBasic}.
 *
 * Strips JSON-LD boilerplate, normalizes every property to a predictable
 * singular-or-array shape, and flattens complex schema-dts objects to
 * simple string/object representations.
 */

import is from '@sindresorhus/is'
import type { BasicDependency, BasicPersonOrOrg, CodeMetaBasic } from './types-basic.js'
import type { CodeMeta } from './types.js'
import { log } from './log.js'

// ─── Property classification ─────────────────────────────────────────

/** Properties that should always be a single value (never an array). */
const SINGULAR_PROPERTIES = new Set([
	'applicationCategory',
	'applicationSubCategory',
	'codeRepository',
	'copyrightYear',
	'dateCreated',
	'dateModified',
	'datePublished',
	'description',
	'developmentStatus',
	'downloadUrl',
	'funding',
	'identifier',
	'installUrl',
	'isAccessibleForFree',
	'issueTracker',
	'license',
	'name',
	'position',
	'readme',
	'relatedLink',
	'releaseNotes',
	'softwareHelp',
	'softwareVersion',
	'url',
	'version',
])

/** Properties that should always be an array of Person/Organization objects. */
const PERSON_ARRAY_PROPERTIES = new Set([
	'author',
	'contributor',
	'copyrightHolder',
	'editor',
	'funder',
	'maintainer',
	'producer',
	'publisher',
	'sponsor',
])

/** Properties that should always be an array of SoftwareSourceCode objects. */
const DEPENDENCY_ARRAY_PROPERTIES = new Set(['softwareRequirements', 'softwareSuggestions'])

/** Properties that should always be an array of strings. */
const STRING_ARRAY_PROPERTIES = new Set([
	'buildInstructions',
	'citation',
	'continuousIntegration',
	'fileFormat',
	'keywords',
	'memoryRequirements',
	'operatingSystem',
	'permissions',
	'processorRequirements',
	'programmingLanguage',
	'runtimePlatform',
	'sameAs',
	'storageRequirements',
])

// ─── Object flattening helpers ────────────────────────────────────────

/** Flatten a Person or Organization object to simple string fields. */
function flattenPersonOrOrg(value: unknown): BasicPersonOrOrg | undefined {
	if (is.string(value)) {
		return { name: value, type: 'Person' }
	}

	if (!is.plainObject(value)) return undefined

	const object = value as Record<string, unknown>
	const type = object['@type'] ?? object.type
	const resolvedType = type === 'Organization' ? 'Organization' : 'Person'

	return {
		type: resolvedType,
		...(is.string(object.email) ? { email: object.email } : {}),
		...(is.string(object.familyName) ? { familyName: object.familyName } : {}),
		...(is.string(object.givenName) ? { givenName: object.givenName } : {}),
		...(is.string(object.name) ? { name: object.name } : {}),
		...(is.string(object.url) ? { url: object.url } : {}),
	}
}

/** Flatten a SoftwareSourceCode dependency to simple string fields. */
function flattenDependency(value: unknown): BasicDependency | undefined {
	if (!is.plainObject(value)) return undefined

	const object = value as Record<string, unknown>

	return {
		type: 'SoftwareSourceCode',
		...(is.string(object.identifier) ? { identifier: object.identifier } : {}),
		...(is.string(object.name) ? { name: object.name } : {}),
		...(is.string(object.runtimePlatform) ? { runtimePlatform: object.runtimePlatform } : {}),
		...(is.string(object.version) ? { version: object.version } : {}),
	}
}

/** Coerce a value to a string if possible. */
function coerceToString(value: unknown): string | undefined {
	if (is.string(value)) return value
	if (is.number(value)) return String(value)
	if (is.plainObject(value)) {
		const object = value as Record<string, unknown>
		// Try common string-valued keys
		if (is.string(object['@id'])) return object['@id']
		if (is.string(object.name)) return object.name
		if (is.string(object['@value'])) return object['@value']
	}

	return undefined
}

// ─── Main transform ──────────────────────────────────────────────────

/**
 * Convert a full {@link CodeMeta} JSON-LD document to a normalized
 * {@link CodeMetaBasic} object with predictable types.
 */
export function simplify(meta: CodeMeta): CodeMetaBasic {
	const result: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(meta)) {
		// Strip JSON-LD boilerplate
		if (key.startsWith('@') || key === 'id' || key === 'type') continue
		if (value === undefined || value === null) continue

		if (SINGULAR_PROPERTIES.has(key)) {
			result[key] = normalizeSingular(key, value)
		} else if (PERSON_ARRAY_PROPERTIES.has(key)) {
			result[key] = normalizePersonArray(value)
		} else if (DEPENDENCY_ARRAY_PROPERTIES.has(key)) {
			result[key] = normalizeDependencyArray(value)
		} else if (STRING_ARRAY_PROPERTIES.has(key)) {
			result[key] = normalizeStringArray(value, key === 'keywords' || key === 'operatingSystem')
		} else {
			// Unknown property — pass through
			result[key] = value
		}
	}

	return result as CodeMetaBasic
}

/** Normalize a property that should always be singular. */
function normalizeSingular(key: string, value: unknown): unknown {
	if (is.array(value)) {
		if (value.length > 1) {
			log.warn(`${key} has ${value.length} values, using first and discarding rest`)
		}

		const first = value.length > 0 ? value[0] : undefined
		// Coerce objects to strings, but preserve primitives as-is
		if (is.plainObject(first)) return coerceToString(first) ?? first
		return first
	}

	// Coerce objects to strings, but preserve primitives as-is
	if (is.plainObject(value)) return coerceToString(value) ?? value
	return value
}

/** Normalize a property that should always be an array of Person/Org. */
function normalizePersonArray(value: unknown): BasicPersonOrOrg[] {
	const items = is.array(value) ? value : [value]
	const result: BasicPersonOrOrg[] = []
	for (const item of items) {
		const flattened = flattenPersonOrOrg(item)
		if (flattened) {
			result.push(flattened)
		}
	}

	return result
}

/** Normalize a property that should always be an array of dependencies. */
function normalizeDependencyArray(value: unknown): BasicDependency[] {
	const items = is.array(value) ? value : [value]
	const result: BasicDependency[] = []
	for (const item of items) {
		const flattened = flattenDependency(item)
		if (flattened) {
			result.push(flattened)
		}
	}

	return result
}

/** Normalize a property that should always be an array of strings. */
function normalizeStringArray(value: unknown, splitCommas = false): string[] {
	// Split comma-delimited strings before array normalization
	if (splitCommas && is.string(value)) {
		return value
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)
	}

	const items = is.array(value) ? value : [value]
	const result: string[] = []
	for (const item of items) {
		const coerced = coerceToString(item)
		if (coerced) {
			result.push(coerced)
		}
	}

	return result
}
