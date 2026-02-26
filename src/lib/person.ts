/**
 * Person parsing, name splitting, and deduplication.
 */

import type { BlankNode, NamedNode } from 'n3'
import type { Organization as SchemaOrganization, Person as SchemaPerson } from 'schema-dts'
import is from '@sindresorhus/is'
import type { CodeMetaGraph } from './graph.js'
import { namedNode, schema } from './graph.js'

// eslint-disable-next-line ts/no-restricted-types
type Person = Extract<SchemaPerson, object>
// eslint-disable-next-line ts/no-restricted-types
export type Organization = Extract<SchemaOrganization, object>

/**
 * Parse a human name into given (first) and family (last) name parts.
 */
export function parseHumanName(name: string): {
	familyName: string
	givenName: string
} {
	const parts = name.trim().split(/\s+/)
	if (parts.length >= 2) {
		return {
			familyName: parts.slice(1).join(' '),
			givenName: parts[0] ?? '',
		}
	}

	return { familyName: '', givenName: name }
}

/**
 * Parse a person string in the format: "Name <email> (url-or-affiliation)"
 * Used by npm package.json, Cargo.toml authors, etc.
 */
export function parsePersonString(value: string): Person {
	const person: Person = { '@type': 'Person' }

	// Extract email from angle brackets: <email>
	const emailMatch = /([^<]*)<([^>][^>@]*@[^>]+)>\s*(.*)/.exec(value)
	let remaining = value
	if (emailMatch) {
		remaining = (emailMatch[1] + ' ' + emailMatch[3]).trim()
		person.email = emailMatch[2].trim()
	}

	// Extract url or affiliation from parentheses: (...)
	const extraMatch = /([^(]*)\(([^)]+)\)\s*(.*)/.exec(remaining)
	if (extraMatch) {
		remaining = (extraMatch[1] + ' ' + extraMatch[3]).trim()
		const extra = extraMatch[2].trim()
		if (extra.startsWith('http') || extra.startsWith('www')) {
			person.url = extra.startsWith('www') ? `http://${extra}` : extra
		} else if (extra.includes('@') && !extra.includes(' ')) {
			person.email = extra
		} else {
			person.affiliation = {
				'@type': 'Organization',
				name: extra,
			} satisfies Organization
		}
	}

	// Remaining is the name
	const { familyName, givenName } = parseHumanName(remaining)
	if (givenName) person.givenName = givenName
	if (familyName) person.familyName = familyName

	return person
}

/**
 * Split a comma-separated string of authors with RFC822 bracket awareness.
 * Commas inside <>, (), [], {}, "" are not treated as separators.
 */
export function splitCommaRfc822(source: string): string[] {
	const results: string[] = []
	const stack: string[] = []
	let begin = 0

	for (let index = 0; index < source.length; index++) {
		const character = source[index]
		if (character === ',' && stack.length === 0) {
			const part = source.slice(begin, index).trim()
			if (part) results.push(part)
			begin = index + 1
		} else
			switch (character) {
				case '"': {
					if (stack.length > 0 && stack.at(-1) === '"') {
						stack.pop()
					} else {
						stack.push('"')
					}

					break
				}
				case '(':
				case '<':
				case '[':
				case '{': {
					stack.push(character)

					break
				}
				case ')': {
					if (stack.length > 0 && stack.at(-1) === '(') stack.pop()

					break
				}
				case '>': {
					if (stack.length > 0 && stack.at(-1) === '<') stack.pop()

					break
				}
				case ']': {
					if (stack.length > 0 && stack.at(-1) === '[') stack.pop()

					break
				}
				case '}': {
					if (stack.length > 0 && stack.at(-1) === '{') stack.pop()

					break
				}
				// No default
			}
	}

	const lastPart = source.slice(begin).trim()
	if (lastPart) results.push(lastPart)

	return results
}

/**
 * Parse an author string that may contain multiple comma-separated authors.
 * Each author may be in "Name <email> (url)" format.
 */
export function parseAuthorString(value: string, singleAuthor = false): Person[] {
	if (singleAuthor) {
		return [parsePersonString(value.trim())]
	}

	const names = splitCommaRfc822(value.trim())
	return names.map((name) => parsePersonString(name))
}

/**
 * Create a Person object from structured fields (name, email, url, organization).
 */
export function createPerson(fields: {
	email?: string
	name: string
	organization?: string
	url?: string
}): Person {
	const person = parsePersonString(fields.name)

	if (fields.email && !person.email) person.email = fields.email
	if (fields.url && !person.url) person.url = fields.url
	if (fields.organization && !person.affiliation) {
		const affiliation: Organization = {
			'@type': 'Organization',
			name: fields.organization,
		} satisfies Organization
		person.affiliation = affiliation
	}

	return person
}

/**
 * Emit a Person as triples into a CodeMetaGraph.
 * Creates a blank node (or named node if \@id is present), sets schema:Person type,
 * and adds all properties. Returns the node so callers can link it to a subject.
 */
export function emitPerson(person: Person, graph: CodeMetaGraph): BlankNode | NamedNode {
	// eslint-disable-next-line ts/no-explicit-any
	const personId = (person as any)['@id']
	// eslint-disable-next-line ts/no-unsafe-argument
	const personNode = personId ? namedNode(personId) : graph.blank()

	graph.setType(personNode, schema('Person'))

	if (is.string(person.givenName)) {
		graph.addString(personNode, schema('givenName'), person.givenName)
	}

	if (is.string(person.familyName)) {
		graph.addString(personNode, schema('familyName'), person.familyName)
	}

	if (is.string(person.name)) {
		graph.addString(personNode, schema('name'), person.name)
	}

	if (is.string(person.email)) {
		graph.addString(personNode, schema('email'), person.email)
	}

	if (is.string(person.url)) {
		graph.addUrl(personNode, schema('url'), person.url)
	}

	if (is.object(person.affiliation)) {
		const affiliation = person.affiliation as Organization
		const affiliationNode = emitOrganization(affiliation, graph)
		graph.add(personNode, schema('affiliation'), affiliationNode)
	}

	return personNode
}

/**
 * Emit an Organization as triples into a CodeMetaGraph.
 * Returns the node.
 */
export function emitOrganization(org: Organization, graph: CodeMetaGraph): BlankNode | NamedNode {
	// eslint-disable-next-line ts/no-explicit-any
	const orgId = (org as any)['@id']
	// eslint-disable-next-line ts/no-unsafe-argument
	const orgNode = orgId ? namedNode(orgId) : graph.blank()

	graph.setType(orgNode, schema('Organization'))

	if (is.string(org.name)) {
		graph.addString(orgNode, schema('name'), org.name)
	}

	if (is.string(org.url)) {
		graph.addUrl(orgNode, schema('url'), org.url)
	}

	return orgNode
}
