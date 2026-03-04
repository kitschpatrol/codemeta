/**
 * Shared helpers for compare-with-codemetapy tests.
 *
 * Two comparison strategies:
 * - `compareJson`: key-by-key JSON comparison — shows property-level diffs
 * - `compareCanonical`: RDF Dataset Canonicalization (URDNA2015) — semantic
 *   triple-level comparison that ignores structural JSON differences
 *
 * Both strategies normalize documents before comparing, to filter out noise:
 * - Empty string values (codemetapy bug: emits `familyName: ""`)
 * - Keyword array ordering (codemetapy sorts, we preserve source order)
 * - License URL scheme (`http://spdx.org/` → `https://spdx.org/`)
 * - `schema:` prefixed keys (namespace serialization artifacts)
 */

/* eslint-disable ts/no-unsafe-type-assertion */
/* eslint-disable ts/no-explicit-any */

import jsonld from 'jsonld'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { customLoader } from '../src/lib/jsonld-loader.js'

const execAsync = promisify(exec)

/** Safely convert an unknown value to string (avoids no-base-to-string on unknown). */
function safeString(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

// ─── Codemetapy runner ───

/** Check whether codemetapy is on PATH. */
let _available: boolean | undefined

/** Check whether codemetapy is available on PATH. */
export async function codemetapyAvailable(): Promise<boolean> {
	if (_available !== undefined) return _available
	try {
		await execAsync('codemetapy --help', { timeout: 10_000 })
		_available = true
	} catch {
		_available = false
	}
	return _available
}

/** Run codemetapy on a file and return parsed JSON, or undefined on failure. */
export async function runCodemetapy(
	filePath: string,
	inputType?: string,
): Promise<Record<string, unknown> | undefined> {
	try {
		const typeFlag = inputType ? `-i ${inputType} ` : ''
		const { stdout } = await execAsync(`codemetapy --no-cache ${typeFlag}${filePath}`, {
			timeout: 15_000,
		})
		return JSON.parse(stdout) as Record<string, unknown>
	} catch {
		return undefined
	}
}

// ─── Normalization ───

/**
 * Properties where we intentionally differ from codemetapy and that
 * should be ignored during comparison. These are either:
 * - properties we emit but codemetapy doesn't (acceptable features)
 * - properties codemetapy emits from nowhere (codemetapy bugs)
 */
const IGNORE_ONLY_OURS = new Set([
	'citation', // We emit citation URLs; codemetapy either skips or enriches to ScholarlyArticle
	'dateCreated', // We emit from POM inceptionYear, codemetapy doesn't
	'identifier', // We always emit identifier; codemetapy doesn't consistently
	'softwareSuggestions', // We parse dev-deps, codemetapy doesn't
	'url', // We correctly emit from POM <url>; codemetapy maps it to codeRepository
])

const IGNORE_ONLY_THEIRS = new Set([
	'abstract', // Codemetapy v1 legacy property (→ description)
	'applicationCategory', // Codemetapy infers from classifiers/enrichment
	'applicationSubCategory', // Codemetapy infers from classifiers/enrichment
	'audience', // Codemetapy enrichment from input data; not in codemeta spec
	'contIntegration', // Codemetapy v1 legacy property name (→ continuousIntegration)
	'dateRelease', // Codemetapy v1 legacy property (→ datePublished)
	'dateReleased', // Codemetapy infers this; we don't
	'dct:relation', // Codemetapy emits Dublin Core relation; not in codemeta spec
	'developmentStatus', // Codemetapy infers from classifiers/enrichment
	'isSourceCodeOf', // Codemetapy adds this for Poetry; not in source
	'maintainer', // Codemetapy enriches maintainer from CRAN author roles; not always in source
	'relatedLink', // Codemetapy infers this; not always in source
	'releaseNotes', // Codemetapy infers this; not in source
	'repository', // Codemetapy maps Maven <repositories> to repository (artifact repos, not source)
	'review', // Codemetapy formats review metadata differently
	'title', // Codemetapy v1 legacy property
])

/**
 * Normalize a JSON-LD document for comparison by removing noise.
 * Operates on a deep clone — does not mutate the input.
 */
function normalizeDocument(document: Record<string, unknown>): Record<string, unknown> {
	const clone = structuredClone(document)

	// Rename `schema:X` prefixed keys to `X` (namespace serialization artifacts)
	renameSchemaKeys(clone)

	// Flatten typed value objects like { "@type": "xsd:anyURI", "@value": url } → url
	flattenTypedValues(clone)

	// Strip empty string values recursively (codemetapy bug)
	stripEmptyStrings(clone)

	// Strip identifier — we always emit it, codemetapy doesn't consistently
	delete clone.identifier

	// Strip readme — we construct web URLs from codeRepository + filename,
	// codemetapy emits bare filenames or doesn't emit at all. Intentional improvement.
	delete clone.readme

	// Sort keyword arrays (codemetapy sorts alphabetically)
	if (Array.isArray(clone.keywords)) {
		clone.keywords = (clone.keywords as string[]).toSorted()
	}

	// Normalize license URLs: http://spdx.org/ → https://spdx.org/
	normalizeLicenseUrls(clone)

	// Merge softwareSuggestions into softwareRequirements for comparison.
	// We split test/dev deps into softwareSuggestions; codemetapy lumps all
	// into softwareRequirements. Merging before comparison makes the sets match.
	mergeSuggestions(clone)

	// Normalize dependency @type: SoftwareSourceCode → SoftwareApplication
	// codemetapy uses SoftwareApplication for deps, we use SoftwareSourceCode
	normalizeDependencyTypes(clone)

	// Normalize applicationCategory Python list repr strings (codemetapy bug)
	normalizeApplicationCategory(clone)

	// Normalize runtimePlatform: codemetapy emits ["Java", "Java 11"], we emit "Java 11"
	// Keep only the most specific version string
	normalizeRuntimePlatform(clone)

	// Normalize isAccessibleForFree: our RDF roundtrip turns boolean true → string "true"
	normalizeBoolean(clone, 'isAccessibleForFree')

	// Normalize copyrightYear: our RDF roundtrip turns integer → string
	if (typeof clone.copyrightYear === 'number') {
		clone.copyrightYear = String(clone.copyrightYear)
	}

	// Normalize programmingLanguage: strip @type from inner objects
	// We lose ComputerLanguage @type during framing; codemetapy preserves it.
	// Not a semantic difference since the type is implicit from the property.
	normalizeProgrammingLanguage(clone)

	// Sort programmingLanguage arrays by name for stable comparison
	if (Array.isArray(clone.programmingLanguage)) {
		;(clone.programmingLanguage as Array<Record<string, unknown>>).sort((a, b) =>
			safeString(a.name).localeCompare(safeString(b.name)),
		)
	}

	// Sort URL arrays for stable comparison
	for (const key of ['continuousIntegration', 'runtimePlatform']) {
		if (Array.isArray(clone[key])) {
			;(clone[key] as string[]).sort()
		}
	}

	// Strip empty objects from arrays (our framing loses object details for
	// references it can't resolve, leaving bare {} objects)
	stripEmptyObjects(clone)

	// Normalize person arrays: wrap singles, sort by name, strip affiliation ordering
	for (const key of [
		'author',
		'contributor',
		'maintainer',
		'editor',
		'copyrightHolder',
		'funder',
	]) {
		const value = clone[key]
		if (value === null || value === undefined) continue
		// Wrap single object in array
		if (typeof value === 'object' && !Array.isArray(value)) {
			clone[key] = [value]
		}
		// Sort person arrays by familyName then givenName for stable comparison
		if (Array.isArray(clone[key])) {
			normalizePersonArray(clone[key] as Array<Record<string, unknown>>)
		}
	}

	// Normalize v1/v2 @type values to modern equivalent
	normalizeType(clone)

	// Normalize URL key (codemetapy uses "URL" instead of "url" in
	// programmingLanguage objects from v1 context)
	normalizeUrlKey(clone)

	// Strip provider from dependency objects (codemetapy adds CRAN/PyPI provider)
	stripProviderFromDeps(clone)

	// Strip @type from referencePublication objects: we may lose ScholarlyArticle
	// during framing while codemetapy preserves it
	stripPublicationType(clone)

	return clone
}

/**
 * Flatten typed value objects to plain values.
 * e.g. { "@type": "xsd:anyURI", "@value": url } → url
 *      { "\@id": url } → url (when only key is \@id)
 * Codemetapy wraps some values in typed objects; we emit plain strings.
 */
function flattenTypedValues(object: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(object)) {
		if (key.startsWith('@')) continue
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			const record = value as Record<string, unknown>
			if ('@value' in record) {
				object[key] = record['@value']
			} else if (isIdOnlyObject(record)) {
				object[key] = record['@id']
			} else {
				flattenTypedValues(record)
			}
		} else if (Array.isArray(value)) {
			const array = value as unknown[]
			for (let i = 0; i < array.length; i++) {
				const item = array[i]
				if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
					const record = item as Record<string, unknown>
					if ('@value' in record) {
						array[i] = record['@value']
					} else if (isIdOnlyObject(record)) {
						array[i] = record['@id']
					} else {
						flattenTypedValues(record)
					}
				}
			}
		}
	}
}

/** Check if an object is just { "@id": url } with no other meaningful keys. */
function isIdOnlyObject(object: Record<string, unknown>): boolean {
	const keys = Object.keys(object)
	return keys.length === 1 && keys[0] === '@id' && typeof object['@id'] === 'string'
}

/** Recursively strip empty and whitespace-only string values from objects. */
function stripEmptyStrings(object: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(object)) {
		if (value === '' || (typeof value === 'string' && value.trim() === '')) {
			// eslint-disable-next-line ts/no-dynamic-delete
			delete object[key]
		} else if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== null && typeof item === 'object') {
					stripEmptyStrings(item as Record<string, unknown>)
				}
			}
		} else if (value !== null && typeof value === 'object') {
			stripEmptyStrings(value as Record<string, unknown>)
		}
	}
}

/**
 * Strip empty objects from arrays recursively.
 * Our framing loses object details for references it can't resolve,
 * leaving bare {} objects that should be ignored in comparison.
 */
function stripEmptyObjects(object: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(object)) {
		if (key.startsWith('@')) continue
		if (Array.isArray(value)) {
			const filtered = (value as unknown[]).filter((item) => {
				if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
					const record = item as Record<string, unknown>
					const nonMetaKeys = Object.keys(record).filter((k) => !k.startsWith('@'))
					if (nonMetaKeys.length === 0) return false
					stripEmptyObjects(record)
				}
				return true
			})
			object[key] = filtered
			// Unwrap single-element array
			if (filtered.length === 1) {
				object[key] = filtered[0]
			} else if (filtered.length === 0) {
				Reflect.deleteProperty(object, key)
			}
		} else if (value !== null && typeof value === 'object') {
			stripEmptyObjects(value as Record<string, unknown>)
		}
	}
}

/** Rename `schema:X` prefixed keys to unprefixed `X` at top level. */
function renameSchemaKeys(object: Record<string, unknown>): void {
	for (const key of Object.keys(object)) {
		if (key.startsWith('schema:')) {
			const unprefixed = key.slice('schema:'.length)
			// Only rename if the unprefixed key doesn't already exist
			if (!(unprefixed in object)) {
				object[unprefixed] = object[key]
			}
			// eslint-disable-next-line ts/no-dynamic-delete
			delete object[key]
		}
	}
	// Codemetapy uses "repository" instead of standard "codeRepository" for Java POM.
	// But skip the rename if the value is a Maven artifact repository URL (not a source repo).
	if ('repository' in object && !('codeRepository' in object)) {
		const repoValue = object.repository
		const isArtifactRepo = (v: unknown): boolean => {
			if (typeof v === 'string') {
				return /repo\.maven|jitpack\.io|repository\.\w+\.com|maven\.apache|repo1\.maven/.test(v)
			}
			if (Array.isArray(v)) return v.some((item) => isArtifactRepo(item))
			return false
		}
		if (!isArtifactRepo(repoValue)) {
			object.codeRepository = object.repository
		}
		delete object.repository
	}
	// Codemetapy v1 uses "operatingSystems" (plural) instead of "operatingSystem"
	if ('operatingSystems' in object && !('operatingSystem' in object)) {
		object.operatingSystem = object.operatingSystems
		delete object.operatingSystems
	}
	// Codemetapy v1 uses "contIntegration" instead of "continuousIntegration"
	if ('contIntegration' in object && !('continuousIntegration' in object)) {
		object.continuousIntegration = object.contIntegration
		delete object.contIntegration
	}
}

/** Deprecated SPDX identifiers that resolve to -only (codemetapy preserves, we normalize) */
const COMPARE_DEPRECATED_TO_ONLY: Record<string, string> = {
	'AGPL-3.0': 'AGPL-3.0-only',
	'GPL-2.0': 'GPL-2.0-only',
	'GPL-3.0': 'GPL-3.0-only',
	'LGPL-2.0': 'LGPL-2.0-only',
	'LGPL-2.1': 'LGPL-2.1-only',
	'LGPL-3.0': 'LGPL-3.0-only',
}

/**
 * Normalize license URLs in a document.
 * - http://spdx.org/ → https://spdx.org/
 * - .html suffix stripped
 * - Deprecated SPDX IDs (e.g. GPL-3.0) → current form (GPL-3.0-only)
 * - Bare SPDX IDs (e.g. "MIT") → full URL ("https://spdx.org/licenses/MIT")
 * This handles differences between codemetapy and our code for parity comparison.
 */
const normalizeSingleLicense = (value: string): string => {
	let normalized = value.replace('http://spdx.org/', 'https://spdx.org/')
	// Strip .html suffix from SPDX URLs (codemetapy preserves them, we strip them)
	normalized = normalized.replace(/^(https:\/\/spdx\.org\/licenses\/\S+?)\.html$/, '$1')
	// Normalize deprecated SPDX IDs
	const spdxPrefix = 'https://spdx.org/licenses/'
	if (normalized.startsWith(spdxPrefix)) {
		const id = normalized.slice(spdxPrefix.length)
		if (id in COMPARE_DEPRECATED_TO_ONLY) {
			normalized = spdxPrefix + COMPARE_DEPRECATED_TO_ONLY[id]
		}
	}

	// If not already a URL, wrap bare SPDX IDs in the standard URL form
	if (!normalized.startsWith('http') && !normalized.includes('/')) {
		normalized = `https://spdx.org/licenses/${normalized}`
	}
	return normalized
}

function normalizeLicenseUrls(object: Record<string, unknown>): void {
	if (typeof object.license === 'string') {
		object.license = normalizeSingleLicense(object.license)
	} else if (Array.isArray(object.license)) {
		object.license = (object.license as unknown[]).map((item) =>
			typeof item === 'string' ? normalizeSingleLicense(item) : item,
		)
	}
}

/** Merge softwareSuggestions into softwareRequirements (for comparison only) */
function mergeSuggestions(object: Record<string, unknown>): void {
	const suggestions = object.softwareSuggestions
	if (!suggestions) return

	const requirements = object.softwareRequirements
	const suggestionsArray: unknown[] = Array.isArray(suggestions) ? suggestions : [suggestions]

	if (requirements) {
		const requirementsArray: unknown[] = Array.isArray(requirements) ? requirements : [requirements]
		object.softwareRequirements = [...requirementsArray, ...suggestionsArray]
	} else {
		object.softwareRequirements = suggestionsArray
	}

	delete object.softwareSuggestions
}

/** Normalize a single dependency object: type + strip identifier */
function normalizeDep(dep: Record<string, unknown>): void {
	if (dep['@type'] === 'SoftwareSourceCode') {
		dep['@type'] = 'SoftwareApplication'
	}
	// We always emit identifier on deps, codemetapy doesn't — strip for comparison
	delete dep.identifier
	// Strip runtimePlatform from deps (we add it, codemetapy doesn't always)
	delete dep.runtimePlatform
}

/** Check if a dependency is "python" — a runtime constraint, not a real dep. */
function isPythonRuntimeDep(dep: unknown): boolean {
	if (typeof dep !== 'object' || dep === null) return false
	return (dep as Record<string, unknown>).name === 'python'
}

/** Normalize dependency fields: type, strip identifier, sort by name */
function normalizeDependencyTypes(object: Record<string, unknown>): void {
	for (const key of ['softwareRequirements', 'softwareSuggestions']) {
		const value = object[key]
		if (value === null || value === undefined) continue

		// Wrap single object in array for uniform processing
		if (!Array.isArray(value)) {
			if (typeof value === 'object') {
				normalizeDep(value as Record<string, unknown>)
				// Wrap as array for consistent comparison
				object[key] = [value]
			}
			continue
		}

		// Filter out "python" runtime constraint (codemetapy bug: includes it as a dep)
		const filtered = (value as unknown[]).filter((item) => !isPythonRuntimeDep(item))
		object[key] = filtered

		for (const item of filtered) {
			if (item !== null && typeof item === 'object') {
				normalizeDep(item as Record<string, unknown>)
			}
		}
		// Sort dependency arrays by name for stable comparison
		;(filtered as Array<Record<string, unknown>>).sort((a, b) =>
			safeString(a.name).localeCompare(safeString(b.name)),
		)
	}
}

/**
 * Normalize applicationCategory:
 * - codemetapy serializes Python lists as strings like "['a', 'b', 'c']" (bug)
 * - singular string vs array wrapping: always wrap in array
 */
function normalizeApplicationCategory(object: Record<string, unknown>): void {
	const value = object.applicationCategory
	if (typeof value === 'string') {
		// Parse Python list repr "['a', 'b']" → ["a", "b"], or wrap single string in array
		object.applicationCategory =
			value.startsWith("['") && value.endsWith("']")
				? value
						.slice(1, -1)
						.split(', ')
						.map((s) => s.replaceAll(/^'|'$/g, ''))
				: [value]
	}
	// Sort for stable comparison
	if (Array.isArray(object.applicationCategory)) {
		;(object.applicationCategory as string[]).sort()
	}
}

/**
 * Normalize runtimePlatform: codemetapy emits ["Java", "Java 11"] while we
 * emit just "Java 11". Keep only the most specific string (with a version).
 */
function normalizeRuntimePlatform(object: Record<string, unknown>): void {
	const value = object.runtimePlatform
	if (Array.isArray(value)) {
		const strings = (value as unknown[]).filter((v) => typeof v === 'string')
		// Find the most specific entry (longest, or one with a version number)
		const withVersion = strings.filter((s) => /\d/.test(s))
		if (withVersion.length > 0) {
			object.runtimePlatform = withVersion.length === 1 ? withVersion[0] : withVersion
		}
	}
}

/**
 * Normalize a person array: sort by name for stable comparison,
 * deduplicate and sort affiliations, sort inner string arrays, strip empty address.
 */
/** Normalize a single person object: strip noise, sort inner arrays. */
function normalizePerson(person: Record<string, unknown>): void {
	// Strip empty address objects
	if (
		person.address !== null &&
		typeof person.address === 'object' &&
		!Array.isArray(person.address) &&
		Object.keys(person.address).length === 0
	) {
		delete person.address
	}

	// Normalize affiliations: deduplicate, sort, strip blank node IDs
	normalizeAffiliations(person)

	// Sort string arrays within person objects (givenName, familyName, name, email)
	for (const key of ['givenName', 'familyName', 'name', 'email']) {
		if (Array.isArray(person[key])) {
			;(person[key] as string[]).sort()
		}
	}

	// Strip @id from persons (blank node IDs like _:b0 vary between implementations)
	if (typeof person['@id'] === 'string' && person['@id'].startsWith('_:')) {
		delete person['@id']
	}

	// Strip affiliation: codemetapy doesn't emit organization from POM <organization>
	// or other source formats, so affiliation always shows as only-ours noise
	delete person.affiliation
}

/** Normalize affiliations on a person: deduplicate, sort, strip blank node IDs. */
function normalizeAffiliations(person: Record<string, unknown>): void {
	const affValue = person.affiliation
	if (affValue === null || affValue === undefined) return

	// Wrap single object as array for uniform handling
	const affArray: unknown[] = Array.isArray(affValue) ? affValue : [affValue]
	const seen = new Set<string>()
	const deduped: unknown[] = []
	for (const aff of affArray) {
		if (typeof aff !== 'object' || aff === null) {
			deduped.push(aff)
			continue
		}
		const affRecord = aff as Record<string, unknown>
		// Strip blank node @id from affiliations
		if (typeof affRecord['@id'] === 'string' && affRecord['@id'].startsWith('_:')) {
			delete affRecord['@id']
		}
		const key = safeString(affRecord.name)
		if (!seen.has(key)) {
			seen.add(key)
			deduped.push(aff)
		}
	}
	deduped.sort((a, b) =>
		safeString((a as Record<string, unknown>).name).localeCompare(
			safeString((b as Record<string, unknown>).name),
		),
	)
	person.affiliation = deduped.length === 1 ? deduped[0] : deduped
}

function normalizePersonArray(persons: Array<Record<string, unknown>>): void {
	for (const person of persons) {
		normalizePerson(person)
	}
	// Strip address: codemetapy enriches with address data (addressCountry, addressLocality)
	// that may not be in the source file or that we don't extract
	for (const person of persons) {
		delete person.address
	}

	// Sort persons by familyName + givenName for stable order
	persons.sort((a, b) => {
		const nameA = safeString(a.familyName ?? a.name)
		const nameB = safeString(b.familyName ?? b.name)
		if (nameA !== nameB) return nameA.localeCompare(nameB)
		return safeString(a.givenName).localeCompare(safeString(b.givenName))
	})
}

/** Convert string "true"/"false" to boolean for a known boolean property. */
function normalizeBoolean(object: Record<string, unknown>, property: string): void {
	const value = object[property]
	if (value === 'true') object[property] = true
	else if (value === 'false') object[property] = false
}

/**
 * Normalize programmingLanguage objects by removing \@type.
 * Our framing loses ComputerLanguage \@type; codemetapy preserves it.
 * This is not a semantic difference since the type is implicit from the property.
 */
function normalizeProgrammingLanguage(object: Record<string, unknown>): void {
	const value = object.programmingLanguage
	if (value === null || value === undefined) return

	const stripType = (item: unknown) => {
		if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
			const record = item as Record<string, unknown>
			if (record['@type'] === 'ComputerLanguage') {
				delete record['@type']
			}
		}
	}

	if (Array.isArray(value)) {
		for (const item of value) stripType(item)
	} else {
		stripType(value)
	}
}

/**
 * Normalize URL key in nested objects: codemetapy uses "URL" (uppercase)
 * instead of "url" (lowercase) in programmingLanguage objects from v1 context.
 */
function normalizeUrlKey(object: Record<string, unknown>): void {
	const value = object.programmingLanguage
	if (value === null || value === undefined) return

	const fixUrl = (item: unknown) => {
		if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
			const record = item as Record<string, unknown>
			if ('URL' in record && !('url' in record)) {
				record.url = record.URL
				delete record.URL
			}
		}
	}

	if (Array.isArray(value)) {
		for (const item of value) fixUrl(item)
	} else {
		fixUrl(value)
	}
}

/**
 * Normalize \@type: codemeta v1/v2 used "Code" or "software",
 * modern uses "SoftwareSourceCode". Normalize to modern.
 */
function normalizeType(object: Record<string, unknown>): void {
	const type = object['@type']
	if (type === 'Code' || type === 'software') {
		object['@type'] = 'SoftwareSourceCode'
	} else if (Array.isArray(type)) {
		// If array contains both "SoftwareSourceCode" and "Code", keep just the array
		// but replace legacy types with SoftwareSourceCode
		object['@type'] = [
			...new Set(
				(type as string[]).map((t) =>
					t === 'Code' || t === 'software' ? 'SoftwareSourceCode' : t,
				),
			),
		]
		// Unwrap single-element array
		if ((object['@type'] as string[]).length === 1) {
			object['@type'] = (object['@type'] as string[])[0]
		}
	}
}

/**
 * Check if a citation diff is just an enrichment difference.
 * We emit URL strings; codemetapy enriches them to structured objects
 * (ScholarlyArticle, Book, SoftwareSourceCode, CreativeWork).
 * Returns true if the diff should be skipped.
 */
function isCitationEnrichment(ours: unknown, theirs: unknown): boolean {
	// Normalize both to arrays
	const oArray = Array.isArray(ours) ? ours : [ours]
	const tArray = Array.isArray(theirs) ? theirs : [theirs]

	// If we have only strings and they have objects, it's enrichment
	const oursAllSimple = oArray.every((v) => typeof v === 'string')
	const theirsHasObjects = tArray.some((v) => typeof v === 'object' && v !== null)

	if (oursAllSimple && theirsHasObjects) return true

	// If both have objects but theirs has more structure (@type, author, etc.)
	// skip the diff — codemetapy enriches citation objects with additional metadata
	if (
		tArray.some((v) => {
			if (typeof v !== 'object' || v === null) return false
			const object = v as Record<string, unknown>
			return object['@type'] && !(ours as Record<string, unknown>)['@type']
		})
	)
		return true

	return false
}

/**
 * Strip \@type from referencePublication objects.
 * Our framing may lose ScholarlyArticle \@type; codemetapy preserves it.
 * Not a semantic difference since the type is implicit from the property.
 */
function stripPublicationType(object: Record<string, unknown>): void {
	const value = object.referencePublication
	if (value === null || value === undefined) return
	const strip = (item: unknown) => {
		if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
			delete (item as Record<string, unknown>)['@type']
		}
	}
	if (Array.isArray(value)) {
		for (const item of value) strip(item)
	} else {
		strip(value)
	}
}

/** Strip provider from dependency objects (codemetapy adds CRAN/PyPI provider, we don't). */
function stripProviderFromDeps(object: Record<string, unknown>): void {
	for (const key of ['softwareRequirements', 'softwareSuggestions']) {
		const value = object[key]
		if (!Array.isArray(value)) continue
		for (const item of value) {
			if (item !== null && typeof item === 'object') {
				delete (item as Record<string, unknown>).provider
			}
		}
	}
}

/**
 * Normalize license for comparison.
 * codemetapy only picks one license from compound expressions like
 * "MIT OR Apache-2.0". When theirs is a subset of ours, use theirs' set.
 * Also wraps singles as arrays for consistent comparison and sorts.
 */
function normalizeLicense(ours: Record<string, unknown>, theirs: Record<string, unknown>): void {
	// Wrap single strings as arrays
	if (typeof ours.license === 'string') ours.license = [ours.license]
	if (typeof theirs.license === 'string') theirs.license = [theirs.license]

	// Sort both arrays
	if (Array.isArray(ours.license)) (ours.license as string[]).sort()
	if (Array.isArray(theirs.license)) (theirs.license as string[]).sort()

	// If theirs is a strict subset of ours (codemetapy drops licenses from
	// compound expressions), expand theirs to match ours
	if (Array.isArray(ours.license) && Array.isArray(theirs.license)) {
		const oursSet = new Set(ours.license as string[])
		const theirsArray = theirs.license as string[]
		if (
			theirsArray.length < (ours.license as string[]).length &&
			theirsArray.every((l) => oursSet.has(l))
		) {
			theirs.license = [...(ours.license as string[])]
		}
	}
}

/**
 * Check if `subset` is a subset of `superset` by dependency name.
 * Used to accept diffs where we include more deps than codemetapy
 * (build-deps, target-deps that codemetapy omits).
 */
function isDependencySubset(subset: unknown, superset: unknown): boolean {
	if (!Array.isArray(subset) || !Array.isArray(superset)) return false
	const depName = (d: Record<string, unknown>): string => (typeof d.name === 'string' ? d.name : '')
	const superNames = new Set((superset as Array<Record<string, unknown>>).map((d) => depName(d)))
	return (subset as Array<Record<string, unknown>>).every((d) => superNames.has(depName(d)))
}

// ─── JSON key-by-key comparison ───

type JsonDiff = {
	onlyOurs: string[]
	onlyTheirs: string[]
	valueDiffs: Array<{ key: string; ours: unknown; theirs: unknown }>
}

/**
 * Check if a softwareRequirements diff is an acceptable wrapping/subset difference.
 * Returns true if the diff should be skipped.
 */
function isAcceptableDependencyDiff(oValue: unknown, tValue: unknown): boolean {
	// Accept if one is a string and the other is an array containing it
	if (
		typeof oValue === 'string' &&
		Array.isArray(tValue) &&
		tValue.length === 1 &&
		typeof tValue[0] === 'string' &&
		tValue[0] === oValue
	)
		return true
	if (
		typeof tValue === 'string' &&
		Array.isArray(oValue) &&
		oValue.length === 1 &&
		typeof oValue[0] === 'string' &&
		oValue[0] === tValue
	)
		return true
	// Accept if theirs has a superset of ours (codemetapy enrichment)
	if (isDependencySubset(oValue, tValue)) return true
	// Accept if one is a string URL and other is array with superset
	if (typeof oValue === 'string' && Array.isArray(tValue)) {
		const tStrings = tValue.filter((v) => typeof v === 'string')
		if (tStrings.includes(oValue)) return true
	}
	return false
}

/** Check if a value diff should be skipped for a given key. */
function shouldSkipValueDiff(
	key: string,
	normalizedOurs: Record<string, unknown>,
	normalizedTheirs: Record<string, unknown>,
): boolean {
	// For dependency arrays: accept if theirs is a subset of ours
	if (
		(key === 'softwareRequirements' || key === 'softwareSuggestions') &&
		isDependencySubset(normalizedTheirs[key], normalizedOurs[key])
	)
		return true
	// For softwareRequirements: accept various wrapping differences
	if (
		key === 'softwareRequirements' &&
		isAcceptableDependencyDiff(normalizedOurs[key], normalizedTheirs[key])
	)
		return true
	// Enriches URLs to structured objects (ScholarlyArticle, Book).
	if (key === 'citation' && isCitationEnrichment(normalizedOurs[key], normalizedTheirs[key]))
		return true
	return false
}

/** Compare two JSON-LD objects key-by-key, with normalization. */
export function compareJson(
	ours: Record<string, unknown>,
	theirs: Record<string, unknown>,
): JsonDiff {
	const normalizedOurs = normalizeDocument(ours)
	const normalizedTheirs = normalizeDocument(theirs)

	// Cross-document normalization (needs both sides)
	normalizeLicense(normalizedOurs, normalizedTheirs)

	// Codemetapy maps POM <url> to codeRepository; we correctly map it to url.
	// If theirs has codeRepository and ours doesn't but has the same value in url,
	// consider them equivalent.
	if (
		!normalizedOurs.codeRepository &&
		normalizedTheirs.codeRepository &&
		normalizedOurs.url === normalizedTheirs.codeRepository
	) {
		normalizedOurs.codeRepository = normalizedOurs.url
	}

	const ourKeys = new Set(Object.keys(normalizedOurs))
	const theirKeys = new Set(Object.keys(normalizedTheirs))

	const onlyOurs = [...ourKeys].filter(
		(k) => !theirKeys.has(k) && k !== '@context' && !IGNORE_ONLY_OURS.has(k),
	)
	const onlyTheirs = [...theirKeys].filter(
		(k) => !ourKeys.has(k) && k !== '@context' && !IGNORE_ONLY_THEIRS.has(k),
	)

	const valueDiffs: JsonDiff['valueDiffs'] = []
	for (const key of [...ourKeys].filter((k) => theirKeys.has(k) && k !== '@context')) {
		const o = JSON.stringify(normalizedOurs[key])
		const t = JSON.stringify(normalizedTheirs[key])
		if (o !== t && !shouldSkipValueDiff(key, normalizedOurs, normalizedTheirs)) {
			valueDiffs.push({ key, ours: normalizedOurs[key], theirs: normalizedTheirs[key] })
		}
	}

	return { onlyOurs, onlyTheirs, valueDiffs }
}

/** Return true when a JSON diff has zero differences. */
export function isJsonMatch(diff: JsonDiff): boolean {
	return diff.onlyOurs.length === 0 && diff.onlyTheirs.length === 0 && diff.valueDiffs.length === 0
}

/** Pretty-print a JSON diff for vitest failure messages. */
export function formatJsonDiff(diff: JsonDiff): string {
	const lines: string[] = []
	for (const k of diff.onlyOurs) lines.push(`  + ${k} (only ours)`)
	for (const k of diff.onlyTheirs) lines.push(`  - ${k} (only theirs)`)
	for (const { key, ours, theirs } of diff.valueDiffs) {
		lines.push(
			`  ~ ${key}:`,
			`      ours:   ${JSON.stringify(ours).slice(0, 500)}`,
			`      theirs: ${JSON.stringify(theirs).slice(0, 500)}`,
		)
	}
	return lines.join('\n')
}

// ─── RDF canonical comparison ───

type CanonicalDiff = {
	onlyOurs: string[]
	onlyTheirs: string[]
}

/** Canonicalize a JSON-LD document to a sorted set of N-Quad lines. */
async function canonicalize(document: Record<string, unknown>): Promise<Set<string>> {
	// The @types/jsonld types claim canonize returns void, but it returns a string
	const canonize = jsonld.canonize as (input: any, options: any) => Promise<string>
	const nquads = await canonize(document, {
		algorithm: 'URDNA2015',
		documentLoader: customLoader,
		format: 'application/n-quads',
		safe: false,
	})

	return new Set(
		nquads
			.split('\n')
			.map((line) => line.trim())
			// Normalize license URL scheme, .html suffix, and deprecated IDs at the N-Quad level
			.map((line) => line.replaceAll('http://spdx.org/licenses/', 'https://spdx.org/licenses/'))
			.map((line) => line.replaceAll(/(<https:\/\/spdx\.org\/licenses\/\S+?)\.html>/g, '$1>'))
			.map((line) => {
				for (const [deprecated, current] of Object.entries(COMPARE_DEPRECATED_TO_ONLY)) {
					line = line.replaceAll(
						`<https://spdx.org/licenses/${deprecated}>`,
						`<https://spdx.org/licenses/${current}>`,
					)
				}
				return line
			})
			// Drop quads with empty literal objects (codemetapy bug)
			.filter((line) => line !== '' && !line.includes('""')),
	)
}

/**
 * Align dependency arrays between ours and theirs for canonical comparison.
 * If theirs is a subset of ours (by dep name), trim ours to match.
 * This prevents blank node relabeling cascades from extra deps we include
 * (dev-deps, build-deps, target-deps) that codemetapy omits.
 */
function alignDependencies(ours: Record<string, unknown>, theirs: Record<string, unknown>): void {
	const key = 'softwareRequirements'
	const ourDeps = ours[key]
	const theirDeps = theirs[key]

	if (!Array.isArray(ourDeps) || !Array.isArray(theirDeps)) return

	const depName = (d: Record<string, unknown>): string => (typeof d.name === 'string' ? d.name : '')

	const theirNames = new Set((theirDeps as Array<Record<string, unknown>>).map((d) => depName(d)))

	// If theirs is a subset of ours, trim ours to only include deps in theirs
	const allTheirsInOurs = (theirDeps as Array<Record<string, unknown>>).every((d) => {
		const name = depName(d)
		return (ourDeps as Array<Record<string, unknown>>).some((od) => depName(od) === name)
	})

	if (allTheirsInOurs && theirDeps.length <= ourDeps.length) {
		ours[key] = (ourDeps as Array<Record<string, unknown>>).filter((d) =>
			theirNames.has(depName(d)),
		)
	}
}

/** Map property short names to full schema.org IRI predicates for canonical filtering. */
const IGNORE_ONLY_OURS_IRIS = new Set(
	[...IGNORE_ONLY_OURS].map((prop) => `<http://schema.org/${prop}>`),
)
const IGNORE_ONLY_THEIRS_IRIS = new Set(
	[...IGNORE_ONLY_THEIRS].map((prop) => `<http://schema.org/${prop}>`),
)
// Also add codemeta: namespace variants
for (const prop of IGNORE_ONLY_OURS) {
	IGNORE_ONLY_OURS_IRIS.add(`<https://codemeta.github.io/terms/${prop}>`)
}
for (const prop of IGNORE_ONLY_THEIRS) {
	IGNORE_ONLY_THEIRS_IRIS.add(`<https://codemeta.github.io/terms/${prop}>`)
}

/**
 * Compare two JSON-LD documents by canonicalizing both to N-Quads
 * and diffing the resulting triple sets.
 *
 * Normalizes documents before canonicalization to reduce noise from:
 * - License URL scheme differences
 * - Dependency \@type naming (SoftwareSourceCode vs SoftwareApplication)
 * - Known-ignorable properties (IGNORE_ONLY_OURS / IGNORE_ONLY_THEIRS)
 */
export async function compareCanonical(
	ours: Record<string, unknown>,
	theirs: Record<string, unknown>,
): Promise<CanonicalDiff> {
	const normalizedOurs = normalizeDocument(ours)
	const normalizedTheirs = normalizeDocument(theirs)

	// Cross-document normalization (needs both sides) — same as JSON comparison
	normalizeLicense(normalizedOurs, normalizedTheirs)

	// Align dependency sets: if theirs is a subset of ours by dep name,
	// trim ours to match. This prevents blank node relabeling cascades
	// from extra dev-deps/build-deps that codemetapy omits.
	alignDependencies(normalizedOurs, normalizedTheirs)

	// Strip ALL ignored properties from BOTH sides BEFORE canonicalization.
	// Even one extra triple changes URDNA2015 blank node labels for the entire graph,
	// so we must strip from both sides to keep the graphs structurally aligned.
	const allIgnored = new Set([...IGNORE_ONLY_OURS, ...IGNORE_ONLY_THEIRS])
	for (const prop of allIgnored) {
		Reflect.deleteProperty(normalizedOurs, prop)
		Reflect.deleteProperty(normalizedTheirs, prop)
	}

	const ourQuads = await canonicalize(normalizedOurs)
	const theirQuads = await canonicalize(normalizedTheirs)

	const onlyOurs = [...ourQuads].filter((q) => !theirQuads.has(q))
	const onlyTheirs = [...theirQuads].filter((q) => !ourQuads.has(q))

	return { onlyOurs, onlyTheirs }
}

/** Return true when a canonical diff has zero differences. */
export function isCanonicalMatch(diff: CanonicalDiff): boolean {
	return diff.onlyOurs.length === 0 && diff.onlyTheirs.length === 0
}

// Common IRI prefixes for readable output
const PREFIXES: Array<[string, string]> = [
	['http://schema.org/', 'schema:'],
	['https://schema.org/', 'schema:'],
	['https://codemeta.github.io/terms/', 'codemeta:'],
	['https://w3id.org/codemeta/3.0/', 'codemeta:'],
	['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:'],
	['https://spdx.org/licenses/', 'spdx:'],
	['https://www.repostatus.org/', 'repostatus:'],
]

/** Shorten full IRIs to prefixed names for readability. */
function shorten(quad: string): string {
	let result = quad
	for (const [iri, prefix] of PREFIXES) {
		result = result.replaceAll(iri, prefix)
	}
	return result
}

/** Pretty-print a canonical diff for vitest failure messages. */
export function formatCanonicalDiff(diff: CanonicalDiff): string {
	const lines: string[] = []
	if (diff.onlyOurs.length > 0) {
		lines.push(`Only in ours (${String(diff.onlyOurs.length)}):`)
		for (const q of diff.onlyOurs) lines.push(`  + ${shorten(q)}`)
	}
	if (diff.onlyTheirs.length > 0) {
		lines.push(`Only in theirs (${String(diff.onlyTheirs.length)}):`)
		for (const q of diff.onlyTheirs) lines.push(`  - ${shorten(q)}`)
	}
	return lines.join('\n')
}
