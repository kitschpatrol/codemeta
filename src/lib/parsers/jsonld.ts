/**
 * JSON-LD / codemeta.json parser.
 * Imports existing codemeta.json files as RDF triples into the graph.
 *
 * Strategy:
 *   1. Parse and expand JSON-LD using jsonld.expand() with customLoader
 *   2. Migrate v1/v2 property names to v3 using the crosswalk legacy maps
 *   3. Convert to N-Quads via jsonld.toRDF()
 *   4. Parse N-Quads with N3 and add to the graph store
 *   5. Remap the original document subject to the caller's target subject
 */

import type { BlankNode, NamedNode, Quad, Term } from 'n3'
import is from '@sindresorhus/is'
import jsonld from 'jsonld'
import { Parser as N3Parser } from 'n3'
import { readFile } from 'node:fs/promises'
import { t } from 'try'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { crosswalk } from '../crosswalk.js'
import { customLoader } from '../jsonld-loader.js'
import { licenseToSpdx } from '../normalize.js'

const codeMetaLegacyVersionsMap: Record<string, string> = {
	...crosswalk.maps['codemeta-V1'],
	...crosswalk.maps['codemeta-V2'],
	// V2→V3: targetProduct was renamed to isSourceCodeOf
	'http://schema.org/targetProduct': 'https://codemeta.github.io/terms/isSourceCodeOf',
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const SCHEMA_SOFTWARE_SOURCE_CODE = 'http://schema.org/SoftwareSourceCode'

/**
 * Parse a codemeta.json or other JSON-LD file and import triples into the graph.
 */
export async function parseJsonLd(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	const warnings: string[] = []

	const rawData = await readFile(filePath, 'utf8')
	const [ok, error, data] = t(() => JSON.parse(rawData) as Record<string, unknown>)
	if (!ok) {
		return [`Error parsing ${filePath}: ${error instanceof Error ? error.message : String(error)}`]
	}

	// Pre-process: normalize bare SPDX IDs in license field to full URLs.
	// The codemeta context types license as @id, so bare strings like "MIT" get
	// mangled into relative IRIs during expansion. Convert them first.
	normalizeLicenseField(data)

	// 1. Expand JSON-LD (resolves contexts, produces full IRIs)
	const expanded = await jsonld.expand(data, { documentLoader: customLoader })

	// 2. Migrate legacy v1/v2 property IRIs to v3
	const migrated = expanded.map((element) => migrateKeys(element, codeMetaLegacyVersionsMap))

	// 3. Convert expanded JSON-LD to N-Quads string
	// eslint-disable-next-line ts/no-unsafe-argument, ts/no-explicit-any
	const nquads = (await jsonld.toRDF(migrated as any, {
		format: 'application/n-quads',
	})) as unknown as string

	// 4. Parse N-Quads and determine the original document subject
	// Filter out quads with null/undefined terms (caused by empty @id values).
	// N3 types say these are non-nullable, but empty @id can produce null at runtime.
	/* eslint-disable ts/no-unnecessary-condition, no-eq-null, eqeqeq -- defensive runtime check */
	const quads = new N3Parser({ format: 'N-Quads' })
		.parse(nquads)
		.filter((q) => q.subject != null && q.predicate != null && q.object != null)
	/* eslint-enable ts/no-unnecessary-condition, no-eq-null, eqeqeq */

	// Find the original subject: the node (named or blank) typed as SoftwareSourceCode
	const originalSubjectNode = detectOriginalSubject(quads)

	// 5. Add all quads to the graph, remapping the original subject
	for (const quad of quads) {
		const s = remapTerm(quad.subject, originalSubjectNode, subject)
		const p = quad.predicate as NamedNode

		// Skip rdf:type SoftwareSourceCode on the main subject — already set by generateFromFiles
		if (
			s.equals(subject) &&
			p.value === RDF_TYPE &&
			quad.object.value === SCHEMA_SOFTWARE_SOURCE_CODE
		) {
			continue
		}

		const o = remapTerm(quad.object, originalSubjectNode, subject)
		graph.add(s as BlankNode | NamedNode, p, o)
	}

	return warnings
}

/**
 * Detect the original document subject from parsed quads.
 * Priority:
 *   1. Node typed as SoftwareSourceCode
 *   2. Root node — a subject that never appears as an object (the top-level entity)
 */
function detectOriginalSubject(quads: Quad[]): Term | undefined {
	// 1. Check for a node typed as SoftwareSourceCode
	for (const quad of quads) {
		if (quad.predicate.value === RDF_TYPE && quad.object.value === SCHEMA_SOFTWARE_SOURCE_CODE) {
			return quad.subject
		}
	}

	// 2. Find root nodes: subjects that never appear as objects
	const subjects = new Set(quads.map((q) => q.subject.value))
	const objects = new Set(quads.map((q) => q.object.value))
	for (const quad of quads) {
		if (subjects.has(quad.subject.value) && !objects.has(quad.subject.value)) {
			return quad.subject
		}
	}

	return undefined
}

/**
 * Remap a term: if it matches the original subject, replace with target.
 * Works for both NamedNodes and BlankNodes.
 */
function remapTerm(term: Term, original: Term | undefined, target: NamedNode): Term {
	if (original && term.equals(original)) {
		return target
	}

	return term
}

/**
 * Normalize bare SPDX identifiers in the license field to full URLs.
 * The codemeta context types license as \@id, so bare strings like "MIT"
 * get expanded as relative IRIs and lost. Convert them to spdx.org URLs.
 */
function normalizeLicenseField(data: Record<string, unknown>): void {
	const { license } = data
	if (is.string(license) && !license.startsWith('http')) {
		data.license = licenseToSpdx(license)
	} else if (is.array(license)) {
		data.license = license.map((item) => {
			if (is.string(item) && !item.startsWith('http')) {
				return licenseToSpdx(item)
			}
			return item
		})
	}
}

/**
 * Recursively migrate expanded JSON-LD property IRIs using a key map.
 * Handles v1→v3 and v2→v3 property renames.
 */
function migrateKeys(node: unknown, keyMap: Record<string, string>): unknown {
	if (is.array(node)) {
		return node.map((leaf) => migrateKeys(leaf, keyMap))
	}

	if (!is.plainObject(node)) {
		return node
	}

	const result: Record<string, unknown> = {}
	for (const [uri, value] of Object.entries(node)) {
		const targetUri: string = keyMap[uri] ?? uri

		// Recurse
		result[targetUri] = migrateKeys(value, keyMap)
	}

	return result
}
