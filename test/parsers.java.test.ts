/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseJava } from '../src/lib/parsers/java.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/pom')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseJava(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('Java parser — feature-rich POM (pennstate-alexa-tools)', () => {
	const fixture = resolve(fixtures, 'pennstate-alexa-tools.pom.xml')

	it('should parse basic properties', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('Alexa Tools')
		expect(meta.identifier).toBe('edu.psu.swe.alexa-tools')
		expect(meta.version).toBe('1.0-SNAPSHOT')
		expect(meta.description).toBe(
			'This library is a set of utility methods to help in building Alexa Skills',
		)
	})

	it('should parse license from name and url', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('http://spdx.org/licenses/Apache-2.0')
	})

	it('should parse developers as authors', async () => {
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(3)
		const shawn = authors.find((a) => a.givenName === 'Shawn')
		expect(shawn).toBeDefined()
		expect(shawn!.familyName).toBe('Smith')
		expect(shawn!.email).toBe('ses44@psu.edu')
		expect(shawn!.url).toBe('https://github.com/ussmith')
	})

	it('should parse scm as codeRepository', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/PennState/ssml-builder')
	})

	it('should parse url', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.url).toBe('git@github.com:PennState/alexa-tools.git')
	})

	it('should parse issue management as issueTracker', async () => {
		const meta = await parseToJsonLd(fixture)
		// This fixture has no issueManagement, but we test the shape
		expect(meta.issueTracker).toBeUndefined()
	})

	it('should separate test-scope dependencies into softwareSuggestions', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>

		// Lombok and alexa-skills-kit are compile scope (no scope = compile)
		const lombok = requirements.find((d) => d.name === 'lombok')
		expect(lombok).toBeDefined()
		expect(lombok!.version).toBe('1.16.10')

		// Hamcrest-all is test scope
		const hamcrest = suggestions.find((d) => d.name === 'hamcrest-all')
		expect(hamcrest).toBeDefined()
	})

	it('should skip dependency versions with Maven variables', async () => {
		const meta = await parseToJsonLd(fixture)
		const requirements = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>
		const all = [...requirements, ...suggestions]

		// Slf4j-api version is ${slf4j.version} — should be skipped
		const slf4j = all.find((d) => d.name === 'slf4j-api')
		expect(slf4j).toBeDefined()
		expect(slf4j!.version).toBeUndefined()
	})

	it('should set Java defaults', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.programmingLanguage).toBe('Java')
		expect(meta.runtimePlatform).toBe('Java')
	})
})

describe('Java parser — HaloDB (yahoo-halodb)', () => {
	const fixture = resolve(fixtures, 'yahoo-halodb.pom.xml')

	it('should parse basic properties', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('HaloDB')
		expect(meta.identifier).toBe('com.oath.halodb.halodb')
		expect(meta.version).toBe('0.5.6')
	})

	it('should parse author', async () => {
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0].givenName).toBe('Arjun')
		expect(authors[0].familyName).toBe('Mannaly')
	})

	it('should parse scm url as codeRepository', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/yahoo/HaloDB')
	})

	it('should separate test-scope deps into softwareSuggestions', async () => {
		const meta = await parseToJsonLd(fixture)
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>
		// Hamcrest-all, testng, jmockit, assertj-core, log4j-* are test scope
		expect(suggestions.length).toBeGreaterThanOrEqual(5)
		expect(suggestions.find((d) => d.name === 'testng')).toBeDefined()
	})
})

describe('Java parser — variable resolution (a466350665-smart-sso)', () => {
	const fixture = resolve(fixtures, 'a466350665-smart-sso.pom.xml')

	// eslint-disable-next-line no-template-curly-in-string
	it('should resolve ${project.artifactId} in name', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('smart-sso')
	})

	it('should parse issue management', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.issueTracker).toBe('https://github.com/a466350665/smart-sso/issues')
	})

	it('should parse developer with organization', async () => {
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0].email).toBe('a466350665@qq.com')
	})
})

describe('Java parser — inceptionYear and java.version', () => {
	it('should parse inceptionYear as dateCreated', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'r351574nc3-cartographer.pom.xml'))
		expect(meta.dateCreated).toBe('2017')
	})

	it('should extract java.version for runtimePlatform', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'widoco.pom.xml'))
		expect(meta.runtimePlatform).toBe('Java 1.8')
	})

	it('should resolve name with groupId and artifactId variables', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'r351574nc3-cartographer.pom.xml'))
		expect(meta.name).toBe('com.github.r351574nc3.nexus:nexus-parent')
	})
})

describe('Java parser — empty XML elements (astewart27)', () => {
	const fixture = resolve(fixtures, 'astewart27-aem-component-generator.pom.xml')

	it('should handle empty self-closing tags gracefully', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBe('mvn-component-generator')
		expect(meta.version).toBe('0.0.1-SNAPSHOT')
		// Empty <url/> should not appear
		expect(meta.url).toBeUndefined()
		// Empty <license/> should not appear
		expect(meta.license).toBeUndefined()
		// Empty <developer/> should not appear
		expect(meta.author).toBeUndefined()
	})

	it('should parse java.version 17', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.runtimePlatform).toBe('Java 17')
	})
})
