/**
 * Integration tests for the built CLI artifact (dist/bin/cli.js).
 *
 * These tests exercise the compiled output end-to-end, including WASM
 * tree-sitter code paths (gemspec, setup.py), to verify the build is correct.
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const cli = resolve(import.meta.dirname, '..', 'dist', 'bin', 'cli.js')
const fixtures = resolve(import.meta.dirname, 'fixtures')

async function run(...args: string[]) {
	const { stderr, stdout } = await execFileAsync('node', [cli, ...args], {
		timeout: 30_000,
	})
	return { stderr, stdout }
}

async function runJson(...args: string[]): Promise<Record<string, unknown>> {
	const { stdout } = await run(...args)
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return JSON.parse(stdout) as Record<string, unknown>
}

// ─── Precondition ───

describe('CLI artifact', () => {
	it('should exist at dist/bin/cli.js', () => {
		expect(existsSync(cli)).toBe(true)
	})
})

// ─── Basic invocation ───

describe('basic invocation', () => {
	it('should print version', async () => {
		const { stdout } = await run('--version')
		expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
	})

	it('should print help', async () => {
		const { stdout } = await run('--help')
		expect(stdout).toContain('codemeta')
		expect(stdout).toContain('--output')
		expect(stdout).toContain('--basic')
	})

	it('should reject unknown flags', async () => {
		await expect(run('--bogus-flag')).rejects.toThrow()
	})
})

// ─── Parser: Node.js (package.json) ───

describe('parser: Node.js package.json', () => {
	const fixture = resolve(fixtures, 'package/proycon-labirinto.package.json')

	it('should produce valid JSON-LD', async () => {
		const meta = await runJson(fixture)
		expect(meta['@context']).toBeDefined()
		expect(meta['@type']).toBe('SoftwareSourceCode')
	})

	it('should extract name and version', async () => {
		const meta = await runJson(fixture)
		expect(meta.name).toBe('labirinto')
		expect(meta.version).toBe('0.2.6')
	})

	it('should extract author', async () => {
		const meta = await runJson(fixture)
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const author = meta.author as Record<string, unknown>
		expect(author['@type']).toBe('Person')
		expect(author.givenName).toBe('Maarten')
	})

	it('should extract license as SPDX URI', async () => {
		const meta = await runJson(fixture)
		expect(meta.license).toBe('https://spdx.org/licenses/AGPL-3.0-or-later')
	})
})

// ─── Parser: Rust (Cargo.toml) ───

describe('parser: Rust Cargo.toml', () => {
	const fixture = resolve(fixtures, 'cargo/proycon-analiticcl.Cargo.toml')

	it('should extract name and description', async () => {
		const meta = await runJson(fixture)
		expect(meta.name).toBe('analiticcl')
		expect(meta.description).toContain('approximate string matching')
	})

	it('should extract codeRepository', async () => {
		const meta = await runJson(fixture)
		expect(meta.codeRepository).toBe('https://github.com/proycon/analiticcl')
	})
})

// ─── Parser: Java (pom.xml) ───

describe('parser: Java pom.xml', () => {
	const fixture = resolve(fixtures, 'pom/widoco.pom.xml')

	it('should extract name and programmingLanguage', async () => {
		const meta = await runJson(fixture)
		expect(meta.name).toBe('Widoco')
		expect(meta.programmingLanguage).toBe('Java')
	})
})

// ─── Parser: JSON-LD (codemeta.json) ───

describe('parser: JSON-LD codemeta.json', () => {
	const fixture = resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json')

	it('should round-trip a full codemeta.json', async () => {
		const meta = await runJson(fixture)
		expect(meta.name).toBe('Frog')
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.codeRepository).toBe('https://github.com/LanguageMachines/frog')
	})

	it('should preserve authors as Person objects', async () => {
		const meta = await runJson(fixture)
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const authors = meta.author as Array<Record<string, unknown>>
		expect(Array.isArray(authors)).toBe(true)
		expect(authors.length).toBeGreaterThan(0)
		expect(authors[0]['@type']).toBe('Person')
	})
})

// ─── Parser: Ruby gemspec (WASM tree-sitter-ruby) ───

describe('parser: Ruby gemspec (WASM)', () => {
	const fixture = resolve(fixtures, 'gemspec/adn-rb-adn.adn.gemspec')

	it('should parse gemspec via tree-sitter-ruby WASM', async () => {
		const meta = await runJson(fixture)
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBeDefined()
	})

	it('should extract authors', async () => {
		const meta = await runJson(fixture)
		const authors = Array.isArray(meta.author) ? meta.author : [meta.author]
		expect(authors.length).toBeGreaterThan(0)
	})
})

// ─── Parser: Python setup.py (WASM tree-sitter-python) ───

describe('parser: Python setup.py (WASM)', () => {
	const fixture = resolve(fixtures, 'setup-py/agalitsyna-fontanka.setup.py')

	it('should parse setup.py via tree-sitter-python WASM', async () => {
		const meta = await runJson(fixture)
		expect(meta['@type']).toBe('SoftwareSourceCode')
		expect(meta.name).toBe('fontanka')
	})

	it('should extract license', async () => {
		const meta = await runJson(fixture)
		expect(meta.license).toBe('https://spdx.org/licenses/MIT')
	})
})

// ─── Parser: Python pyproject.toml ───

describe('parser: Python pyproject.toml', () => {
	const fixture = resolve(fixtures, 'pyproject/proycon-codemetapy.pyproject.toml')

	it('should extract name and codeRepository', async () => {
		const meta = await runJson(fixture)
		expect(meta.name).toBeDefined()
		expect(meta.codeRepository).toBe('https://github.com/proycon/codemetapy')
	})
})

// ─── Multi-file composition ───

describe('multi-file composition', () => {
	it('should compose package.json + codemeta.json', async () => {
		const meta = await runJson(
			resolve(fixtures, 'package/proycon-labirinto.package.json'),
			resolve(fixtures, 'codemeta/proycon-labirinto-harvest.codemeta.json'),
		)
		expect(meta.name).toBe('labirinto')
		// IssueTracker comes from the codemeta.json, not package.json
		expect(meta.issueTracker).toBe('https://github.com/proycon/labirinto/issues')
	})
})

// ─── --basic flag ───

describe('--basic flag', () => {
	const fixture = resolve(fixtures, 'package/proycon-labirinto.package.json')

	it('should strip JSON-LD boilerplate', async () => {
		const meta = await runJson('--basic', fixture)
		expect(meta['@context']).toBeUndefined()
		expect(meta['@type']).toBeUndefined()
		expect(meta.name).toBe('labirinto')
	})

	it('should normalize arrays for singular properties', async () => {
		const meta = await runJson('--basic', fixture)
		// In basic mode, singular properties should not be nested objects with @type
		expect(typeof meta.name).toBe('string')
	})
})

// ─── --enrich flag ───

describe('--enrich flag', () => {
	it('should infer programmingLanguage from runtimePlatform', async () => {
		const meta = await runJson(
			'--enrich',
			resolve(fixtures, 'pyproject/proycon-codemetapy.pyproject.toml'),
		)
		expect(meta.programmingLanguage).toBeDefined()
	})
})

// ─── --set flag ───

describe('--set flag', () => {
	it('should override a property', async () => {
		const meta = await runJson(
			'--set',
			'name=OverriddenName',
			resolve(fixtures, 'cargo/proycon-analiticcl.Cargo.toml'),
		)
		expect(meta.name).toBe('OverriddenName')
	})
})

// ─── --output flag ───

describe('--output flag', () => {
	let tempDirectory: string

	beforeAll(() => {
		tempDirectory = mkdtempSync(join(tmpdir(), 'codemeta-cli-test-'))
	})

	afterAll(() => {
		rmSync(tempDirectory, { force: true, recursive: true })
	})

	it('should write JSON to a file', async () => {
		const outFile = join(tempDirectory, 'output.json')
		await run('--output', outFile, resolve(fixtures, 'cargo/proycon-analiticcl.Cargo.toml'))
		expect(existsSync(outFile)).toBe(true)
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const content = JSON.parse(readFileSync(outFile, 'utf8')) as Record<string, unknown>
		expect(content.name).toBe('analiticcl')
		expect(content['@type']).toBe('SoftwareSourceCode')
	})
})

// ─── --validate flag ───

describe('--validate flag', () => {
	it('should pass validation for complete metadata', async () => {
		const { stderr } = await run(
			'--validate',
			resolve(fixtures, 'codemeta/languagemachines-frog.codemeta.json'),
		)
		// Should not contain "Validation failed"
		expect(stderr).not.toContain('Validation failed')
	})
})
