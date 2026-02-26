import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crosswalk } from '../src/lib/crosswalk.js'
import { CodeMetaGraph, namedNode, schema } from '../src/lib/graph.js'
import { parseGoModule } from '../src/lib/parsers/go-module.js'

const fixtures = resolve(import.meta.dirname, 'fixtures/go-mod')
const SUBJECT = 'https://example.org/test'

async function parseToJsonLd(filePath: string): Promise<Record<string, unknown>> {
	const graph = new CodeMetaGraph()
	const subject = namedNode(SUBJECT)
	graph.setType(subject, schema('SoftwareSourceCode'))
	await parseGoModule(filePath, graph, subject, crosswalk)
	return graph.toJsonLd(SUBJECT)
}

// ─── Module identity ───

describe('go.mod parser — module identity', () => {
	it('should extract module path as identifier', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'kisielk-errcheck.go.mod'))
		expect(meta.identifier).toBe('github.com/kisielk/errcheck')
	})

	it('should infer codeRepository from github.com module path', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'kisielk-errcheck.go.mod'))
		expect(meta.codeRepository).toBe('https://github.com/kisielk/errcheck')
	})

	it('should strip /vN suffix from codeRepository', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'ory-keto.go.mod'))
		expect(meta.identifier).toBe('github.com/ory/keto')
		expect(meta.codeRepository).toBe('https://github.com/ory/keto')
	})

	it('should NOT set codeRepository for custom domain module', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'miniflux-v2.go.mod'))
		expect(meta.identifier).toBe('miniflux.app/v2')
		expect(meta.codeRepository).toBeUndefined()
	})

	it('should handle simple module name with no dots', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'daniilpyatko-hse-golang-2020-1.go.mod'))
		expect(meta.identifier).toBe('api')
		expect(meta.codeRepository).toBeUndefined()
	})
})

// ─── Go version ───

describe('go.mod parser — Go version', () => {
	it('should extract runtimePlatform from go directive', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'miniflux-v2.go.mod'))
		expect(meta.runtimePlatform).toBe('Go ≥1.26.0')
	})

	it('should handle patch version in go directive', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'dagger-dagger.go.mod'))
		expect(meta.runtimePlatform).toBe('Go ≥1.25.1')
	})

	it('should handle missing go directive', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'daniilpyatko-hse-golang-2020-1.go.mod'))
		expect(meta.runtimePlatform).toBeUndefined()
	})
})

// ─── Programming language ───

describe('go.mod parser — programming language', () => {
	it('should always infer programmingLanguage as Go', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'daniilpyatko-hse-golang-2020-1.go.mod'))
		expect(meta.programmingLanguage).toBe('Go')
	})
})

// ─── Dependencies (softwareRequirements) ───

describe('go.mod parser — dependencies', () => {
	it('should extract a single direct dependency', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'kisielk-errcheck.go.mod'))
		const deps = meta.softwareRequirements
		expect(deps).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const depList = (Array.isArray(deps) ? deps : [deps]) as Array<Record<string, unknown>>
		expect(depList).toHaveLength(1)
		expect(depList[0].name).toBe('golang.org/x/tools')
		expect(depList[0].version).toBe('v0.30.0')
	})

	it('should extract multiple direct deps from block form', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'miniflux-v2.go.mod'))
		const deps = meta.softwareRequirements
		expect(deps).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const depList = (Array.isArray(deps) ? deps : [deps]) as Array<Record<string, unknown>>
		// First require block has 14 direct deps
		expect(depList).toHaveLength(14)
		expect(depList.map((d) => d.name)).toContain('github.com/gorilla/mux')
	})

	it('should skip indirect deps in mixed blocks', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'dagger-dagger.go.mod'))
		const deps = meta.softwareRequirements
		expect(deps).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const depList = (Array.isArray(deps) ? deps : [deps]) as Array<Record<string, unknown>>
		// 5 direct in first block + 1 (dagger.io/dagger) in third block = 6
		expect(depList).toHaveLength(6)
		expect(depList.map((d) => d.name)).toContain('dagger.io/dagger')
		expect(depList.map((d) => d.name)).toContain('go.opentelemetry.io/otel')
	})

	it('should have no softwareRequirements when all deps are indirect', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'danielecucurachi-personal-website.go.mod'))
		const deps = meta.softwareRequirements
		// The last dep (wowchemy/v5) has no // indirect comment, so it IS direct
		expect(deps).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const depList = (Array.isArray(deps) ? deps : [deps]) as Array<Record<string, unknown>>
		expect(depList).toHaveLength(1)
	})

	it('should have no softwareRequirements when no require block exists', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'daniilpyatko-hse-golang-2020-1.go.mod'))
		expect(meta.softwareRequirements).toBeUndefined()
	})

	it('should strip +incompatible from version strings', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'ory-keto.go.mod'))
		const deps = meta.softwareRequirements
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const depList = (Array.isArray(deps) ? deps : [deps]) as Array<Record<string, unknown>>
		const uuid = depList.find((d) => d.name === 'github.com/gofrs/uuid')
		expect(uuid).toBeDefined()
		expect(String(uuid!.version)).not.toContain('+incompatible')
		expect(uuid!.version).toBe('v4.4.0')
	})

	it('should set runtimePlatform on dependency nodes', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'kisielk-errcheck.go.mod'))
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const dep = meta.softwareRequirements as Record<string, unknown>
		expect(dep.runtimePlatform).toBe('Go')
	})
})

// ─── Tool dependencies (softwareSuggestions) ───

describe('go.mod parser — tool dependencies', () => {
	it('should deduplicate tool that is already a direct dep', async () => {
		// Photoview has `tool github.com/99designs/gqlgen` but it's also a direct require dep,
		// so emitDependencies deduplicates it — no softwareSuggestions remain
		const meta = await parseToJsonLd(resolve(fixtures, 'photoview-photoview.go.mod'))
		expect(meta.softwareSuggestions).toBeUndefined()
	})

	it('should extract tool block with multiple entries', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'ory-keto.go.mod'))
		const tools = meta.softwareSuggestions
		expect(tools).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const toolList = (Array.isArray(tools) ? tools : [tools]) as Array<Record<string, unknown>>
		// Google.golang.org/protobuf is also a direct dep, so it gets deduplicated → 8
		expect(toolList).toHaveLength(8)
		expect(toolList.map((t) => t.name)).toContain('github.com/josephburnett/jd')
		expect(toolList.map((t) => t.name)).toContain('github.com/mattn/goveralls')
	})

	it('should have no softwareSuggestions when no tool section exists', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'kisielk-errcheck.go.mod'))
		expect(meta.softwareSuggestions).toBeUndefined()
	})
})

// ─── Replace directives ───

describe('go.mod parser — replace directives', () => {
	it('should remove deps replaced with local paths', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'ory-keto.go.mod'))
		const deps = meta.softwareRequirements
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const depList = (Array.isArray(deps) ? deps : [deps]) as Array<Record<string, unknown>>
		// Github.com/ory/keto/proto and github.com/ory/x are replaced with local paths
		const names = depList.map((d) => String(d.name))
		expect(names).not.toContain('github.com/ory/keto/proto')
		expect(names).not.toContain('github.com/ory/x')
		// 40 direct deps minus 2 local replacements = 38
		expect(depList).toHaveLength(38)
	})

	it('should not affect indirect deps with replacements', async () => {
		// In xiaomi-gaea, dgrijalva/jwt-go is indirect, so replacement doesn't change output
		const meta = await parseToJsonLd(resolve(fixtures, 'xiaomi-gaea.go.mod'))
		const deps = meta.softwareRequirements
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- test-only access
		const depList = (Array.isArray(deps) ? deps : [deps]) as Array<Record<string, unknown>>
		const names = depList.map((d) => String(d.name))
		// Dgrijalva/jwt-go was indirect, so it's not in direct deps at all
		expect(names).not.toContain('github.com/dgrijalva/jwt-go')
		// Golang-jwt/jwt shouldn't appear either (replacement of indirect dep)
		expect(names).not.toContain('github.com/golang-jwt/jwt')
	})
})

// ─── Pattern matching ───

describe('go.mod parser — pattern matching', () => {
	it('should match go.mod', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('go.mod')?.name).toBe('go-mod')
	})

	it('should not match go.sum', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('go.sum')?.name).not.toBe('go-mod')
	})

	it('should not match go.work', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('go.work')?.name).not.toBe('go-mod')
	})

	it('should not match gomod.txt', async () => {
		const { findParser } = await import('../src/lib/parsers/index.js')
		expect(findParser('gomod.txt')?.name).not.toBe('go-mod')
	})
})

// ─── Minimal files ───

describe('go.mod parser — minimal files', () => {
	it('should handle module-only file', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'daniilpyatko-hse-golang-2020-1.go.mod'))
		expect(meta.identifier).toBe('api')
		expect(meta.programmingLanguage).toBe('Go')
		expect(meta.runtimePlatform).toBeUndefined()
		expect(meta.softwareRequirements).toBeUndefined()
		expect(meta.softwareSuggestions).toBeUndefined()
	})

	it('should handle module + go version with no deps', async () => {
		const meta = await parseToJsonLd(resolve(fixtures, 'factor-bc-factor-core.go.mod'))
		expect(meta.identifier).toBe('github.com/karalabe/usb')
		expect(meta.programmingLanguage).toBe('Go')
		expect(meta.runtimePlatform).toBe('Go ≥1.12')
		expect(meta.softwareRequirements).toBeUndefined()
	})
})
