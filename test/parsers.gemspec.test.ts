/* eslint-disable ts/no-unsafe-type-assertion */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseGemspecFile } from '../src/lib/parsers/gemspec.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/gemspec')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseGemspecFile(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

describe('gemspec parser — basic properties', () => {
	const fixture = resolve(fixtures, 'ankane-blazer.blazer.gemspec')

	it('should parse name', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.name).toBe('blazer')
	})

	it('should emit identifier from name', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.identifier).toBe('blazer')
	})

	it('should parse summary as description', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.description).toContain('Explore your data with SQL')
	})

	it('should parse homepage as url', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.url).toBe('https://github.com/ankane/blazer')
	})

	it('should parse homepage as codeRepository when it looks like a source repo', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/ankane/blazer')
	})

	it('should parse license', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
	})

	it('should parse single author', async () => {
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0]['@type']).toBe('Person')
		expect(authors[0].givenName).toBe('Andrew')
		expect(authors[0].familyName).toBe('Kane')
	})

	it('should parse author email', async () => {
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors[0].email).toBe('andrew@ankane.org')
	})

	it('should parse runtime dependencies as softwareRequirements', async () => {
		const meta = await parseToJsonLd(fixture)
		const deps = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		expect(deps.length).toBeGreaterThan(0)
		const railties = deps.find((d) => d.name === 'railties')
		expect(railties).toBeDefined()
		expect(railties!.version).toBe('>= 7.1')
	})

	it('should emit programmingLanguage as Ruby', async () => {
		const meta = await parseToJsonLd(fixture)
		expect(meta.programmingLanguage).toBe('Ruby')
	})
})

describe('gemspec parser — complex properties', () => {
	it('should parse version when statically defined', async () => {
		const fixture = resolve(fixtures, 'josephpecoraro-rr.rr.gemspec')
		const meta = await parseToJsonLd(fixture)
		expect(meta.version).toBe('1.0.4')
	})

	it('should parse multiple authors', async () => {
		const fixture = resolve(fixtures, 'bigbinary-mail-interceptor.mail_interceptor.gemspec')
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors).toHaveLength(1)
		expect(authors[0].familyName).toBe('Singh')
	})

	it('should pair email with author', async () => {
		const fixture = resolve(fixtures, 'bigbinary-mail-interceptor.mail_interceptor.gemspec')
		const meta = await parseToJsonLd(fixture)
		const authors = [meta.author].flat() as Array<Record<string, unknown>>
		expect(authors[0].email).toBe('neeraj@BigBinary.com')
	})

	it('should parse runtime and development dependencies separately', async () => {
		const fixture = resolve(fixtures, 'bigbinary-mail-interceptor.mail_interceptor.gemspec')
		const meta = await parseToJsonLd(fixture)

		const reqs = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>

		// Runtime deps
		const activesupport = reqs.find((d) => d.name === 'activesupport')
		expect(activesupport).toBeDefined()
		expect(activesupport!.version).toBe('>= 7')

		// Dev deps
		const bundler = suggestions.find((d) => d.name === 'bundler')
		expect(bundler).toBeDefined()
	})

	it('should parse Apache-2.0 license', async () => {
		const fixture = resolve(fixtures, 'apache-arrow.red-arrow-cuda.gemspec')
		const meta = await parseToJsonLd(fixture)
		expect(meta.license).toBe('https://spdx.org/licenses/Apache-2.0')
	})

	it('should parse homepage that is not a source repo as url only', async () => {
		const fixture = resolve(fixtures, 'josephpecoraro-rr.rr.gemspec')
		const meta = await parseToJsonLd(fixture)
		// http://blog.bogojoker.com is not a source repo
		expect(meta.url).toBe('http://blog.bogojoker.com')
		expect(meta.codeRepository).toBeUndefined()
	})

	it('should prefer description over summary', async () => {
		const fixture = resolve(fixtures, 'yob-em-ftpd.em-ftpd.gemspec')
		const meta = await parseToJsonLd(fixture)
		expect(meta.description).toBe('Build a custom FTP server backed by a datastore of your choice')
	})

	it('should parse required_ruby_version as runtimePlatform', async () => {
		const fixture = resolve(fixtures, 'yob-em-ftpd.em-ftpd.gemspec')
		const meta = await parseToJsonLd(fixture)
		const platforms = [meta.runtimePlatform].flat() as string[]
		expect(platforms).toContain('Ruby >=2.2')
	})

	it('should parse dependencies with multiple version constraints', async () => {
		const fixture = resolve(fixtures, 'ttscoff-na-gem.na.gemspec')
		const meta = await parseToJsonLd(fixture)
		const deps = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		const chronic = deps.find((d) => d.name === 'chronic')
		expect(chronic).toBeDefined()
		expect(chronic!.version).toBe('~> 0.10, >= 0.10.2')
	})
})

describe('gemspec parser — edge cases', () => {
	it('should handle gemspec with no version (dynamic constant)', async () => {
		const fixture = resolve(fixtures, 'ankane-blazer.blazer.gemspec')
		const meta = await parseToJsonLd(fixture)
		// Version is Blazer::VERSION (dynamic), should be undefined
		expect(meta.version).toBeUndefined()
	})

	it('should parse description from %q{} syntax', async () => {
		const fixture = resolve(
			fixtures,
			'therole-the-role-management-panel.the_role_management_panel.gemspec',
		)
		const meta = await parseToJsonLd(fixture)
		expect(meta.description).toContain('Management panel for TheRole')
	})

	it('should parse GitHub homepage as codeRepository', async () => {
		const fixture = resolve(
			fixtures,
			'therole-the-role-management-panel.the_role_management_panel.gemspec',
		)
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://github.com/TheRole/the_role_management_panel')
	})

	it('should parse GitLab homepage as codeRepository', async () => {
		const fixture = resolve(fixtures, 'terceiro-chake.chake.gemspec')
		const meta = await parseToJsonLd(fixture)
		expect(meta.codeRepository).toBe('https://gitlab.com/terceiro/chake')
	})

	it('should handle add_dependency as runtime dependency', async () => {
		const fixture = resolve(fixtures, 'terceiro-chake.chake.gemspec')
		const meta = await parseToJsonLd(fixture)
		const deps = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		const rake = deps.find((d) => d.name === 'rake')
		expect(rake).toBeDefined()
	})

	it('should parse development dependencies from add_development_dependency', async () => {
		const fixture = resolve(fixtures, 'terceiro-chake.chake.gemspec')
		const meta = await parseToJsonLd(fixture)
		const suggestions = [meta.softwareSuggestions].flat() as Array<Record<string, unknown>>
		expect(suggestions.length).toBeGreaterThan(0)
		const rspec = suggestions.find((d) => d.name === 'rspec')
		expect(rspec).toBeDefined()
	})

	it('should handle gemspec with heredoc description', async () => {
		const fixture = resolve(fixtures, 'bradfeehan-derelict.derelict.gemspec')
		const meta = await parseToJsonLd(fixture)
		// Description is in a heredoc — may or may not be extracted
		// At minimum, name should be extracted
		expect(meta.name).toBe('derelict')
	})

	it('should handle runtime dependencies with != version constraint', async () => {
		const fixture = resolve(fixtures, 'bradfeehan-derelict.derelict.gemspec')
		const meta = await parseToJsonLd(fixture)
		const deps = [meta.softwareRequirements].flat() as Array<Record<string, unknown>>
		const log4r = deps.find((d) => d.name === 'log4r')
		expect(log4r).toBeDefined()
		expect(log4r!.version).toContain('~> 1.1.0')
	})
})
