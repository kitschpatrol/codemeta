/* eslint-disable ts/no-unsafe-argument */
/* eslint-disable ts/no-explicit-any */

/**
 * CodeMeta RDF Graph — Thin wrapper around N3.Store for building CodeMeta JSON-LD.
 *
 * Architecture:
 *   Parsers emit triples into an N3.Store via convenience methods.
 *   Serialization converts RDF → expanded JSON-LD → jsonld.frame().
 */

import type { BlankNode, Literal, NamedNode, Quad, Term } from 'n3'
import is, { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is'
import jsonld from 'jsonld'
import { DataFactory, Store, Writer } from 'n3'
import { crosswalk, isCrosswalkTypeKey, parseCrosswalkKey, SUBJECT_PARENT_TYPES } from './crosswalk'
import codeMetaFramingContextDoc from './data/codemeta-framing.json' with { type: 'json' }
import codeMetaContextDoc from './data/codemeta.json' with { type: 'json' }
import { customLoader } from './jsonld-loader.js'
import { licenseToSpdx } from './normalize.js'
import { createPerson, emitPerson, parseAuthorString } from './person.js'

/** Typed wrapper for creating a literal RDF term. */
function literal(value: string, languageOrDatatype?: NamedNode | string): Literal {
	return DataFactory.literal(value, languageOrDatatype)
}

/** Typed wrapper for creating a named node RDF term. */
export function namedNode(value: string): NamedNode {
	return DataFactory.namedNode(value)
}

// ─── Namespace helpers ───────────────────────────────────────────────

function ns(base: string) {
	return (term: string): NamedNode => namedNode(`${base}${term}`)
}

export const schema = ns('http://schema.org/')
export const codemeta = ns('https://codemeta.github.io/terms/')
const rdf = ns('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
// const xsd = ns('http://www.w3.org/2001/XMLSchema#')
// const spdx = ns('http://spdx.org/licenses/')

// ─── CodeMeta context data ───────────────────────────────────────────

const CODEMETA_CONTEXT = codeMetaContextDoc['@context']
const FRAMING_CONTEXT = codeMetaFramingContextDoc['@context']

/** Build a map from property name → full IRI using the codemeta context */
function buildPropertyIriMap(): Map<string, string> {
	const prefixes: Record<string, string> = {}
	const map = new Map<string, string>()

	// First pass: collect prefix definitions
	for (const [key, value] of Object.entries(CODEMETA_CONTEXT)) {
		if (is.string(value) && !key.startsWith('@')) {
			prefixes[key] = value
		}
	}

	// Second pass: resolve property IRIs
	for (const [key, value] of Object.entries(CODEMETA_CONTEXT)) {
		if (key.startsWith('@')) continue

		let iri: string | undefined
		if (is.object(value) && '@id' in value) {
			const compactIri = (value as Record<string, string>)['@id']
			// Resolve compact IRIs like "schema:name"
			const colonIndex = compactIri.indexOf(':')
			if (colonIndex > 0) {
				const prefix = compactIri.slice(0, colonIndex)
				const local = compactIri.slice(colonIndex + 1)
				if (prefix in prefixes) {
					iri = prefixes[prefix] + local
				}
			}
		} else if (is.string(value)) {
			// This is a prefix definition, skip
			continue
		}

		if (iri) {
			map.set(key, iri)
		}
	}

	return map
}

const PROPERTY_IRI_MAP = buildPropertyIriMap()

/** Properties whose values should be treated as IRIs (have \@type: \@id in context) */
function buildIriValueProperties(): Set<string> {
	const properties = new Set<string>()
	for (const [key, value] of Object.entries(CODEMETA_CONTEXT)) {
		if (
			is.object(value) &&
			'@type' in value &&
			(value as Record<string, string>)['@type'] === '@id'
		) {
			properties.add(key)
		}
	}

	return properties
}

const IRI_VALUE_PROPERTIES = buildIriValueProperties()

// ─── Post-processing ─────────────────────────────────────────────────

/**
 * Recursively flatten bare { "@id": url } objects to plain URL strings.
 * Also flatten bare { "@value": val } objects to plain values.
 * This handles the fact that we strip \@type from the framing context.
 */
function flattenBareIdObjects(object: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(object)) {
		if (key.startsWith('@')) continue

		if (is.array(value)) {
			for (let i = 0; i < value.length; i++) {
				const item = value[i]
				if (is.plainObject(item)) {
					const flattened = flattenValue(item as Record<string, unknown>)
					if (flattened === undefined) {
						flattenBareIdObjects(item as Record<string, unknown>)
					} else {
						value[i] = flattened
					}
				}
			}
		} else if (is.plainObject(value)) {
			const flattened = flattenValue(value as Record<string, unknown>)
			if (flattened === undefined) {
				flattenBareIdObjects(value as Record<string, unknown>)
			} else {
				object[key] = flattened
			}
		}
	}
}

/** Try to flatten a JSON-LD value object to a plain value. */
function flattenValue(object: Record<string, unknown>): unknown {
	const keys = Object.keys(object)
	// { "@id": url } → url
	if (keys.length === 1 && keys[0] === '@id') return object['@id']
	// { "@value": val } → val
	if (keys.length === 1 && keys[0] === '@value') return object['@value']
	// { "@type": ..., "@value": val } → val (typed literals like dates)
	if (keys.length === 2 && '@type' in object && '@value' in object) return object['@value']
	return undefined
}

/**
 * Unwrap \@list containers that JSON-LD framing may introduce.
 * Transforms `{ "\@list": [...items] }` → `[...items]` for all properties.
 */
function unwrapListContainers(object: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(object)) {
		if (key.startsWith('@')) continue

		if (is.array(value)) {
			// Check if any array element is a @list wrapper
			const unwrapped: unknown[] = []
			for (const item of value) {
				if (is.plainObject(item) && '@list' in item && is.array((item as any)['@list'])) {
					unwrapped.push(...((item as any)['@list'] as unknown[]))
				} else {
					unwrapped.push(item)
				}
			}

			object[key] = unwrapped

			// Recurse into items
			for (const item of unwrapped) {
				if (is.plainObject(item)) {
					unwrapListContainers(item as Record<string, unknown>)
				}
			}
		} else if (is.plainObject(value)) {
			// Single @list wrapper
			if ('@list' in value && is.array((value as any)['@list'])) {
				object[key] = (value as any)['@list']
			} else {
				unwrapListContainers(value as Record<string, unknown>)
			}
		}
	}
}

/** Set of property names explicitly defined in the framing context. */
const FRAMING_PROPERTIES = new Set(Object.keys(FRAMING_CONTEXT).filter((k) => !k.startsWith('@')))

/**
 * Strip top-level properties not explicitly defined in the framing context.
 * Without \@vocab, unknown predicates appear as full IRIs or prefix-compacted
 * names (e.g. "codemeta:controlledTerms", "schema:parentOrganization").
 * Only applied at the top level — nested objects may use schema.org properties
 * not in our framing vocabulary (e.g. parentOrganization on Organization).
 */
function stripUnknownProperties(object: Record<string, unknown>): void {
	for (const key of Object.keys(object)) {
		if (key.startsWith('@')) continue
		if (!FRAMING_PROPERTIES.has(key)) {
			Reflect.deleteProperty(object, key)
		}
	}
}

/**
 * Recursively strip blank node \@id values ("_:b0", "_:b1", etc.) from objects.
 * These are internal identifiers added by JSON-LD framing for shared nodes.
 */
function stripBlankNodeIds(object: Record<string, unknown>): void {
	if (is.string(object['@id']) && object['@id'].startsWith('_:')) {
		delete object['@id']
	}

	for (const value of Object.values(object)) {
		if (is.array(value)) {
			for (const item of value) {
				if (is.plainObject(item)) {
					stripBlankNodeIds(item as Record<string, unknown>)
				}
			}
		} else if (is.plainObject(value)) {
			stripBlankNodeIds(value as Record<string, unknown>)
		}
	}
}

// ─── CodeMetaGraph ───────────────────────────────────────────────────

export class CodeMetaGraph {
	readonly store: Store
	/** Tracks already-emitted dependency names to deduplicate across fields. */
	private readonly seenDeps = new Set<string>()

	constructor() {
		this.store = new Store()
	}

	/** Add a triple to the graph. */
	add(s: BlankNode | NamedNode, p: NamedNode, o: Term) {
		this.store.addQuad(DataFactory.quad(s, p, o as any))
	}

	/**
	 * Add a property by its CodeMeta name, auto-resolving the predicate IRI.
	 * Handles both literal and URI values based on context definition.
	 */
	addProperty(subject: BlankNode | NamedNode, propertyName: string, value: string) {
		const predicate = this.propertyToIri(propertyName)
		if (!predicate) return

		if (this.isIriProperty(propertyName)) {
			this.addUrl(subject, predicate, value)
		} else {
			this.addString(subject, predicate, value)
		}
	}

	/**
	 * Add a property using a prefixed crosswalk key (e.g. "schema:Thing/name").
	 * Parses the key to extract parent type and property name, then auto-resolves
	 * the predicate IRI.
	 *
	 * For subject-level parent types (Thing, CreativeWork, SoftwareSourceCode,
	 * SoftwareApplication), simple scalar/array values are added directly.
	 *
	 * For complex types (Person, Organization, etc.), the value is interpreted
	 * based on expected types and appropriate sub-nodes are created.
	 */
	addPropertySmart(subject: BlankNode | NamedNode, prefixedKey: string, value: unknown) {
		if (!isCrosswalkTypeKey(prefixedKey)) return
		const parsed = parseCrosswalkKey(prefixedKey)
		if (!parsed) return

		const { parentType, property } = parsed

		// Only handle subject-level parent types; skip Person, Organization, etc.
		if (!SUBJECT_PARENT_TYPES.has(parentType)) return

		// Property-specific normalization that applies across all parsers
		if (this.addNormalizedValue(subject, property, value)) return

		const typesForProperty = crosswalk.types[prefixedKey]

		// Simple scalar/array types
		if (this.isSimpleType(typesForProperty)) {
			const predicate = this.propertyToIri(property)
			if (!predicate) return

			if (is.array(value)) {
				for (const item of value) {
					if (isNonEmptyStringAndNotWhitespace(item)) {
						this.addSimpleValue(subject, predicate, property, item)
					}
				}
			} else if (isNonEmptyStringAndNotWhitespace(value)) {
				this.addSimpleValue(subject, predicate, property, value)
			}

			return
		}

		// Complex types (Person, Organization, CreativeWork, etc.)
		this.addComplexValue(subject, property, typesForProperty, value)
	}

	/** Add a literal string value. Ignores empty/whitespace-only values. */
	addString(subject: BlankNode | NamedNode, predicate: NamedNode, value: string) {
		if (!is.nonEmptyStringAndNotWhitespace(value)) return
		this.add(subject, predicate, literal(value))
	}

	/** Add a URL-valued property. Ignores empty/whitespace-only values. */
	addUrl(subject: BlankNode | NamedNode, predicate: NamedNode, url: string) {
		if (!is.nonEmptyStringAndNotWhitespace(url)) return
		this.add(subject, predicate, namedNode(url))
	}

	/** Create a fresh blank node. */
	blank(): BlankNode {
		return DataFactory.blankNode()
	}

	/**
	 * Emit a dependency map (e.g. { "lodash": "^4.0.0" }) as SoftwareSourceCode
	 * sub-nodes linked to the subject via the given predicate.
	 * Deduplicates against already-seen dependency names.
	 */
	emitDependencies(
		subject: BlankNode | NamedNode,
		predicate: NamedNode,
		value: unknown,
		platform?: string,
	) {
		if (!is.plainObject(value)) return
		for (const [depName, version] of Object.entries(value as Record<string, unknown>)) {
			if (this.seenDeps.has(depName)) continue
			this.seenDeps.add(depName)

			const depNode = this.blank()
			this.setType(depNode, schema('SoftwareSourceCode'))
			this.addString(depNode, schema('identifier'), depName)
			this.addString(depNode, schema('name'), depName)
			if (is.string(version)) {
				this.addString(depNode, schema('version'), version)
			} else if (is.plainObject(version)) {
				// Cargo/Poetry style: { version: "1.0", features: [...] }
				const depVersion = (version as Record<string, unknown>).version
				if (is.string(depVersion)) {
					this.addString(depNode, schema('version'), depVersion)
				}
			}

			if (platform) {
				this.addString(depNode, schema('runtimePlatform'), platform)
			}

			this.add(subject, predicate, depNode)
		}
	}

	/**
	 * Emit an engines object (e.g. { "node": ">=18" }) as runtimePlatform strings.
	 */
	emitEngines(subject: BlankNode | NamedNode, value: unknown) {
		if (!is.plainObject(value)) return
		const predicate = schema('runtimePlatform')
		for (const [engine, version] of Object.entries(value as Record<string, unknown>)) {
			if (is.string(version)) {
				this.addString(subject, predicate, `${engine} ${version}`)
			}
		}
	}

	/**
	 * Emit a license value. Handles string, object ({ type: "..." }), and arrays.
	 * Normalizes to SPDX URIs.
	 */
	emitLicense(subject: BlankNode | NamedNode, value: unknown) {
		const predicate = schema('license')

		if (is.string(value)) {
			// Handle SPDX compound expressions like "MIT OR Apache-2.0"
			if (value.includes(' OR ') || value.includes(' AND ')) {
				for (const part of value.split(/ (?:OR|AND) /)) {
					this.addUrl(subject, predicate, licenseToSpdx(part.trim()))
				}
			} else {
				this.addUrl(subject, predicate, licenseToSpdx(value))
			}
		} else if (is.plainObject(value) && !is.array(value)) {
			const object = value as Record<string, unknown>
			// NPM-style { type: "MIT" }, PEP 621 { text: "MIT" }, or POM { name: "...", url: "..." }
			const text = is.string(object.type)
				? object.type
				: is.string(object.text)
					? object.text
					: is.string(object.name)
						? object.name
						: undefined
			if (text) {
				const spdx = licenseToSpdx(text)
				// If name didn't resolve to an SPDX URI, try the url field
				if (!spdx.includes('spdx') && is.string(object.url)) {
					this.addUrl(subject, predicate, licenseToSpdx(object.url))
				} else {
					this.addUrl(subject, predicate, spdx)
				}
			} else if (is.string(object.url)) {
				// No name/type/text, but has url — try that
				this.addUrl(subject, predicate, licenseToSpdx(object.url))
			}
		} else if (is.array(value)) {
			for (const item of value) {
				this.emitLicense(subject, item)
			}
		}
	}

	/**
	 * Emit a person or organization value as sub-nodes linked to the subject
	 * via the given predicate. Handles string, object, and array inputs.
	 */
	emitPersonOrOrg(subject: BlankNode | NamedNode, predicate: NamedNode, value: unknown) {
		const values = is.array(value) ? value : [value]

		for (const item of values) {
			if (is.string(item)) {
				for (const person of parseAuthorString(item, true)) {
					const node = emitPerson(person, this)
					this.add(subject, predicate, node)
				}
			} else if (is.plainObject(item)) {
				const object = item as Record<string, unknown>
				const name = is.string(object.name) ? object.name : undefined
				if (!name) continue
				const person = createPerson({
					email: is.string(object.email) ? object.email : undefined,
					name,
					url: is.string(object.url) ? object.url : undefined,
				})
				const node = emitPerson(person, this)
				this.add(subject, predicate, node)
			}
		}
	}

	/**
	 * Emit a repository value. Handles string and object ({ url: "..." }).
	 * Normalizes git URLs.
	 */
	emitRepository(subject: BlankNode | NamedNode, value: unknown) {
		const predicate = schema('codeRepository')
		let rawUrl: string | undefined

		if (is.string(value)) {
			rawUrl = resolveRepoShorthand(value)
		} else if (is.plainObject(value)) {
			const object = value as Record<string, unknown>
			if (is.string(object.url)) {
				rawUrl = object.url
			}
		}

		if (rawUrl) {
			this.addUrl(subject, predicate, normalizeRepoUrl(rawUrl))
		}
	}

	/**
	 * Get all object values for a given subject and predicate.
	 */
	getValues(subject: BlankNode | NamedNode, predicate: NamedNode): string[] {
		return this.store.getQuads(subject, predicate, null, null).map((q) => q.object.value)
	}

	/**
	 * Check if any triples exist for the given subject and predicate.
	 */
	hasProperty(subject: BlankNode | NamedNode, predicate: NamedNode): boolean {
		return this.store.getQuads(subject, predicate, null, null).length > 0
	}

	/**
	 * Check if a property's value should be a URI (has \@type: \@id in context).
	 */
	isIriProperty(name: string): boolean {
		return IRI_VALUE_PROPERTIES.has(name)
	}

	/**
	 * Resolve a CodeMeta property name to its full IRI.
	 * E.g. "codeRepository" → "http://schema.org/codeRepository"
	 */
	propertyToIri(name: string): NamedNode | undefined {
		const iri = PROPERTY_IRI_MAP.get(name)
		return iri ? namedNode(iri) : undefined
	}

	/**
	 * Remove all triples with the given subject and predicate.
	 * Useful for "override" semantics.
	 */
	removeProperty(subject: BlankNode | NamedNode, predicate: NamedNode) {
		const matches = this.store.getQuads(subject, predicate, null, null)
		for (const q of matches) {
			this.store.removeQuad(q)
		}
	}

	/** Set rdf:type. */
	setType(subject: BlankNode | NamedNode, type: NamedNode) {
		this.add(subject, rdf('type'), type)
	}

	/**
	 * Serialize the graph to JSON-LD, compacted and framed against the CodeMeta context.
	 */
	async toJsonLd(subjectIri?: string): Promise<Record<string, unknown>> {
		// Jsonld.fromRDF can take an array of n3 quads directly

		const expanded = (await jsonld.fromRDF([...this.store])) as any

		const frame: any = {
			'@context': FRAMING_CONTEXT,
			'@embed': '@always',
			'@type': 'http://schema.org/SoftwareSourceCode',
		}

		if (subjectIri) {
			frame['@id'] = subjectIri
		}

		// eslint-disable-next-line ts/await-thenable, ts/no-confusing-void-expression -- jsonld.frame returns Promise but @types/jsonld overloads confuse TS
		const framed = (await jsonld.frame(expanded, frame, {
			documentLoader: customLoader,
		} as any)) as any

		// Replace inline context with canonical URLs, only including contexts
		// whose terms are actually used in the graph
		framed['@context'] = this.buildContextArray()

		// Clean up JSON-LD framing artifacts
		delete framed['@graph']

		// Strip properties not explicitly defined in the framing context.
		// Without @vocab, unknown predicates remain as full IRIs after framing.
		stripUnknownProperties(framed)

		// Strip blank node @id values from nested objects — these are internal
		// identifiers added by framing for shared nodes, not meaningful output.
		stripBlankNodeIds(framed)

		// Flatten bare { "@id": url } objects to plain strings.
		// Since we stripped @type from the framing context, URI values appear
		// as objects.
		flattenBareIdObjects(framed)

		// Unwrap @list containers that JSON-LD framing may introduce.
		// e.g. author: [{"@list": [...persons]}] → author: [...persons]
		unwrapListContainers(framed)

		// Ensure author is always an array (matches @container: @list in context)
		if (framed.author && !is.array(framed.author)) {
			framed.author = [framed.author]
		}

		return framed as Record<string, unknown>
	}

	/** Dump to N-Triples. */
	async toNTriples(): Promise<string> {
		return new Promise((resolve, reject) => {
			const writer = new Writer({ format: 'N-Triples' })
			for (const q of this.store) {
				writer.addQuad(q as Quad)
			}

			writer.end((error, result) => {
				// eslint-disable-next-line ts/no-unused-expressions, ts/no-unnecessary-condition
				error ? reject(error) : resolve(result)
			})
		})
	}

	private addComplexValue(
		subject: BlankNode | NamedNode,
		property: string,
		types: string[],
		value: unknown,
	) {
		const predicate = this.propertyToIri(property)
		if (!predicate) return

		const hasPersonOrOrg = types.includes('Person') || types.includes('Organization')

		if (hasPersonOrOrg) {
			this.emitPersonOrOrg(subject, predicate, value)
			return
		}

		// License gets special SPDX normalization
		if (property === 'license') {
			this.emitLicense(subject, value)
			return
		}

		// SoftwareSourceCode dependencies — emit as sub-nodes, deduplicating
		if (types.includes('SoftwareSourceCode')) {
			this.emitDependencies(subject, predicate, value)
		}
	}

	/**
	 * Handle properties that need value normalization regardless of which parser
	 * produced them. Returns true if the property was handled, false to fall
	 * through to generic simple/complex type handling.
	 */
	private addNormalizedValue(
		subject: BlankNode | NamedNode,
		property: string,
		value: unknown,
	): boolean {
		switch (property) {
			// Normalize git URLs, handle object { url } and string shorthand
			case 'codeRepository': {
				this.emitRepository(subject, value)
				return true
			}

			// Strip scoped package prefix (@scope/name → name) and also emit identifier
			case 'name': {
				if (!isNonEmptyStringAndNotWhitespace(value)) return true
				let name: string = value
				if (name.startsWith('@') && name.includes('/')) {
					name = name.split('/')[1]!
				}

				this.addString(subject, schema('name'), name)
				const identifierIri = this.propertyToIri('identifier')
				if (identifierIri) {
					this.addString(subject, identifierIri, value)
				}

				return true
			}

			// Format engine objects { node: ">=18" } as "node >=18" strings
			case 'runtimePlatform': {
				if (is.plainObject(value)) {
					this.emitEngines(subject, value)
				} else if (isNonEmptyStringAndNotWhitespace(value)) {
					this.addString(subject, schema('runtimePlatform'), value)
				}

				return true
			}

			default: {
				return false
			}
		}
	}

	private addSimpleValue(
		subject: BlankNode | NamedNode,
		predicate: NamedNode,
		property: string,
		value: string,
	) {
		if (this.isIriProperty(property)) {
			this.addUrl(subject, predicate, value)
		} else {
			this.addString(subject, predicate, value)
		}
	}

	/**
	 * Build the \@context array, including only contexts whose terms are
	 * actually present in the graph. Codemeta and schema.org are always included.
	 */
	private buildContextArray(): string[] {
		const contexts: string[] = ['https://w3id.org/codemeta/3.1']

		// Check for repostatus: developmentStatus values referencing repostatus.org
		const hasRepostatus = this.store
			.getQuads(null, null, null, null)
			.some((q) => q.object.value.includes('repostatus.org'))
		if (hasRepostatus) {
			contexts.push(
				'https://raw.githubusercontent.com/jantman/repostatus.org/master/badges/latest/ontology.jsonld',
			)
		}

		// Check for software-types: types or properties from the stypes namespace
		const softwareTypeIris = new Set([
			'https://w3id.org/software-types#CommandLineApplication',
			'https://w3id.org/software-types#DesktopApplication',
			'https://w3id.org/software-types#executableName',
			'https://w3id.org/software-types#NotebookApplication',
			'https://w3id.org/software-types#ServerApplication',
			'https://w3id.org/software-types#SoftwareImage',
			'https://w3id.org/software-types#SoftwareLibrary',
			'https://w3id.org/software-types#SoftwarePackage',
			'https://w3id.org/software-types#TerminalApplication',
		])
		const hasSoftwareTypes = this.store
			.getQuads(null, null, null, null)
			.some((q) => softwareTypeIris.has(q.object.value) || softwareTypeIris.has(q.predicate.value))
		if (hasSoftwareTypes) {
			contexts.push('https://w3id.org/software-types')
		}

		// Check for software-iodata: consumesData or producesData properties
		const hasIoData = this.store
			.getQuads(null, null, null, null)
			.some(
				(q) =>
					q.predicate.value === 'https://w3id.org/software-iodata#consumesData' ||
					q.predicate.value === 'https://w3id.org/software-iodata#producesData',
			)
		if (hasIoData) {
			contexts.push('https://w3id.org/software-iodata')
		}

		// Schema.org is always included
		contexts.push('https://schema.org')

		return contexts
	}

	private isSimpleType(types: string[]): boolean {
		const simpleTypesSet = new Set([
			'Boolean',
			'Date',
			'Datetime',
			'Integer',
			'Number',
			'Text',
			'URL',
		])
		return types.every((t) => simpleTypesSet.has(t))
	}
}

// ─── URL normalization helpers ───────────────────────────────────────

/** Resolve npm repository shorthand to full URL. */
function resolveRepoShorthand(value: string): string {
	if (value.startsWith('github:')) return 'https://github.com/' + value.slice('github:'.length)
	if (value.startsWith('gitlab:')) return 'https://gitlab.com/' + value.slice('gitlab:'.length)
	if (value.startsWith('bitbucket:'))
		return 'https://bitbucket.com/' + value.slice('bitbucket:'.length)
	return value
}

/** Normalize a repository URL by stripping git-specific prefixes and .git suffix. */
function normalizeRepoUrl(value: string): string {
	return value
		.replace('git://', 'https://')
		.replace('git+ssh://', 'https://')
		.replace('git+https://', 'https://')
		.replace(/\.git$/, '')
}
