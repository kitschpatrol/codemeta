/**
 * Parser registry and shared types.
 * Maps file patterns to parsers and defines the parser interface.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import type { Crosswalk, CrosswalkSourceKey } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { parseGemspecFile } from './gemspec.js'
import { parseGoModule } from './go-module.js'
import { parseGoreleaser } from './goreleaser.js'
import { parseJava } from './java.js'
import { parseJsonLd } from './jsonld.js'
import { parseLicenseFile } from './license-file.js'
import { parseNodejs } from './nodejs.js'
import { parsePkgInfo } from './pkg-info.js'
import { parsePubliccode } from './publiccode.js'
import { parsePyproject } from './pyproject.js'
import { parseReadme } from './readme.js'
import { parseRust } from './rust.js'
import { parseSetupCfg } from './setup-cfg.js'
import { parseSetupPy } from './setup-py.js'

/**
 * Parser function signature.
 * Parsers emit triples into the graph and return warnings.
 */
type ParserFunction = (
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
) => Promise<string[]>

/**
 * Registry entry for a parser
 * @public
 */
export type ParserEntry = {
	/** Human-readable name */
	name: string
	/** Parser function */
	parser: ParserFunction
	/** Glob pattern or regex for file matching */
	pattern: RegExp | string
	/** Whether this is a primary/canonical metadata source (project manifest) */
	primary?: boolean
	/** Priority for merge ordering (lower = earlier = lower priority) */
	priority: number
	/** Crosswalk source column key */
	sourceKey?: CrosswalkSourceKey
}

/** Pattern used by the JSON-LD (codemeta) parser */
const CODEMETA_PATTERN = /^(.+\.)?codemeta\.json(ld)?$/i

/** The parser registry, ordered by priority */
const parserRegistry: ParserEntry[] = [
	{
		name: 'jsonld',
		parser: parseJsonLd,
		pattern: CODEMETA_PATTERN,
		priority: 0,
	},
	{
		name: 'nodejs',
		parser: parseNodejs,
		pattern: /^(.+\.)?package\.json$/i,
		primary: true,
		priority: 10,
		sourceKey: 'NodeJS',
	},
	{
		name: 'pkg-info',
		parser: parsePkgInfo,
		pattern: /^PKG-INFO$/i,
		primary: true,
		priority: 7,
		sourceKey: 'Python PKG-INFO',
	},
	{
		name: 'setup-py',
		parser: parseSetupPy,
		pattern: /^(.+\.)?setup\.py$/i,
		primary: true,
		priority: 8,
		sourceKey: 'Python Distutils (PyPI)',
	},
	{
		name: 'setup-cfg',
		parser: parseSetupCfg,
		pattern: /^(.+\.)?setup\.cfg$/i,
		primary: true,
		priority: 9,
		sourceKey: 'Python Distutils (PyPI)',
	},
	{
		name: 'pyproject',
		parser: parsePyproject,
		pattern: /^(.+\.)?pyproject\.toml$/i,
		primary: true,
		priority: 10,
		sourceKey: 'Python PEP 621',
	},
	{
		name: 'rust',
		parser: parseRust,
		pattern: /^(.+\.)?cargo\.toml$/i,
		primary: true,
		priority: 10,
		sourceKey: 'Rust Package Manager',
	},
	{
		name: 'java',
		parser: parseJava,
		pattern: /^(.+\.)?pom\.xml$/i,
		primary: true,
		priority: 10,
		sourceKey: 'Java (Maven)',
	},
	{
		name: 'publiccode',
		parser: parsePubliccode,
		pattern: /^(.+\.)?publiccode\.ya?ml$/i,
		primary: true,
		priority: 10,
	},
	{
		name: 'gemspec',
		parser: parseGemspecFile,
		pattern: /\.gemspec$/i,
		primary: true,
		priority: 10,
		sourceKey: 'Ruby Gem',
	},
	{
		name: 'go-mod',
		parser: parseGoModule,
		pattern: /^go\.mod$/i,
		primary: true,
		priority: 9,
	},
	{
		name: 'goreleaser',
		parser: parseGoreleaser,
		pattern: /^\.?goreleaser\.ya?ml$/i,
		primary: true,
		priority: 10,
	},
	{
		name: 'license-file',
		parser: parseLicenseFile,
		/* Spell-checker:disable */
		pattern: /^(un)?licen[cs]e(\.\w+)?$/i,
		/* Spell-checker:enable */
		priority: 20,
	},
	{
		name: 'license-file',
		parser: parseLicenseFile,
		pattern: /^copying(\.\w+)?$/i,
		priority: 20,
	},
	{
		name: 'readme',
		parser: parseReadme,
		pattern: /^readme(\.\w+)?$/i,
		priority: 20,
	},
]

/**
 * Find the parser entry matching a filename.
 */
export function findParser(filename: string): ParserEntry | undefined {
	for (const entry of parserRegistry) {
		if (is.string(entry.pattern)) {
			if (filename === entry.pattern) return entry
		} else if (entry.pattern.test(filename)) {
			return entry
		}
	}

	return undefined
}
