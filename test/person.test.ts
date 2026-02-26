import { describe, expect, it } from 'vitest'
import type { Organization } from '../src/lib/person.js'
import {
	parseAuthorString,
	parseHumanName,
	parsePersonString,
	splitCommaRfc822,
} from '../src/lib/person.js'

describe('parseHumanName', () => {
	it('should parse simple first last', () => {
		const { familyName, givenName } = parseHumanName('John Doe')
		expect(givenName).toBe('John')
		expect(familyName).toBe('Doe')
	})

	it('should handle name with prefix', () => {
		const { familyName, givenName } = parseHumanName('Maarten van Gompel')
		expect(givenName).toBe('Maarten')
		expect(familyName).toBe('van Gompel')
	})

	it('should handle single name', () => {
		const { familyName, givenName } = parseHumanName('Mononym')
		expect(givenName).toBe('Mononym')
		expect(familyName).toBe('')
	})

	it('should handle multiple middle names', () => {
		const { familyName, givenName } = parseHumanName('Ko van der Sloot')
		expect(givenName).toBe('Ko')
		expect(familyName).toBe('van der Sloot')
	})
})

describe('parsePersonString', () => {
	it('should parse name only', () => {
		const person = parsePersonString('John Doe')
		expect(person.givenName).toBe('John')
		expect(person.familyName).toBe('Doe')
		expect(person.email).toBeUndefined()
	})

	it('should parse name with email', () => {
		const person = parsePersonString('John Doe <john@example.com>')
		expect(person.givenName).toBe('John')
		expect(person.familyName).toBe('Doe')
		expect(person.email).toBe('john@example.com')
	})

	it('should parse name with email and url', () => {
		const person = parsePersonString(
			'Barney Rubble <b@rubble.com> (http://barnyrubble.tumblr.com/)',
		)
		expect(person.givenName).toBe('Barney')
		expect(person.familyName).toBe('Rubble')
		expect(person.email).toBe('b@rubble.com')
		expect(person.url).toBe('http://barnyrubble.tumblr.com/')
	})

	it('should parse name with email and affiliation', () => {
		const person = parsePersonString('John Doe <john@example.com> (ACME Corp)')
		expect(person.givenName).toBe('John')
		expect(person.familyName).toBe('Doe')
		expect(person.email).toBe('john@example.com')
		expect(person.affiliation).toBeDefined()

		// eslint-disable-next-line ts/no-unsafe-type-assertion
		expect((person.affiliation! as Organization).name).toBe('ACME Corp')
	})
})

describe('splitCommaRfc822', () => {
	it('should split simple comma-separated list', () => {
		const result = splitCommaRfc822('Alice, Bob, Charlie')
		expect(result).toEqual(['Alice', 'Bob', 'Charlie'])
	})

	it('should not split inside angle brackets', () => {
		const result = splitCommaRfc822('Alice <alice@example.com>, Bob <bob@example.com>')
		expect(result).toEqual(['Alice <alice@example.com>', 'Bob <bob@example.com>'])
	})

	it('should not split inside parentheses', () => {
		const result = splitCommaRfc822('Alice (ACME, Inc.), Bob')
		expect(result).toEqual(['Alice (ACME, Inc.)', 'Bob'])
	})
})

describe('parseAuthorString', () => {
	it('should parse single author', () => {
		const persons = parseAuthorString('John Doe', true)
		expect(persons).toHaveLength(1)
		expect(persons[0].givenName).toBe('John')
	})

	it('should parse multiple authors', () => {
		const persons = parseAuthorString('John Doe <john@example.com>, Jane Doe <jane@example.com>')
		expect(persons).toHaveLength(2)
		expect(persons[0].givenName).toBe('John')
		expect(persons[1].givenName).toBe('Jane')
	})
})
