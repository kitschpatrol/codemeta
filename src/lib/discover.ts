/**
 * Discovery engine: auto-detect metadata files in a directory.
 */

import { basename, resolve } from 'node:path'
import { glob } from 'tinyglobby'
import type { CrosswalkSourceKey } from './crosswalk.js'
import { findParser } from './parsers/index.js'

/** A metadata file found during directory discovery. */
export type DiscoveredFile = {
	/** Absolute path to the discovered file. */
	filePath: string
	/** Name of the parser that will handle this file (e.g. `'nodejs'`, `'jsonld'`). */
	parserName: string
	/** Whether this is a primary metadata source (a project manifest like `package.json` or `Cargo.toml`), as opposed to a supplementary source like `README` or `LICENSE`. */
	primary: boolean
	/** Merge priority — lower values are processed first and overridden by higher-priority sources. */
	priority: number
	/** Crosswalk column key used to map properties from this source format to CodeMeta terms. */
	sourceKey?: CrosswalkSourceKey
}

const IGNORE_PATTERNS = [
	// Dot files and dot directories (at any depth, including cwd root)
	'**/.*',

	// JS / TS / Node
	'**/node_modules',
	'**/dist',
	'**/build',
	'**/out',

	// Rust
	'**/target',
	'**/debug',
	'**/release',

	// Python
	'**/__pycache__',
	'**/venv',

	// Java / JVM

	// General build / CI
	'**/tmp',
	'**/coverage',
]

/** Dotfile patterns to discover despite the general dotfile ignore rule */
const DOTFILE_INCLUDES = ['.goreleaser.yml', '.goreleaser.yaml']

/**
 * Auto-detect metadata files in a directory.
 *
 * Scans for known metadata files (project manifests, license files, readmes,
 * etc.) and returns them sorted by parser priority (lowest first = processed
 * first in merge order).
 *
 * By default, `codemeta.json` files are excluded from results when primary
 * metadata sources (e.g. `package.json`, `Cargo.toml`) are also found. This
 * ensures idempotent generation — the output is a pure function of source
 * metadata. If `codemeta.json` is the only real metadata source (alongside
 * supplementary files like README.md or LICENSE), it is kept as the source of
 * truth. Set {@link retain} to `true` to always include codemeta files.
 * @param directory - The directory to scan for metadata files.
 * @param recursive - If `true`, scan subdirectories recursively.
 * @param ignore - Additional glob patterns to exclude from discovery.
 * @param retain - If `true`, always include `codemeta.json` files even when primary sources are present.
 * @returns Discovered files sorted by parser priority.
 */
export async function discover(
	directory: string,
	recursive = false,
	ignore: string[] = [],
	retain = false,
): Promise<DiscoveredFile[]> {
	const cwd = resolve(directory)
	const globOptions = { absolute: true, cwd, onlyFiles: true }

	const [regularFiles, dotFiles] = await Promise.all([
		glob(recursive ? '**/*' : '*', {
			...globOptions,
			ignore: [...IGNORE_PATTERNS, ...ignore],
		}),
		glob(recursive ? DOTFILE_INCLUDES.map((p) => `**/${p}`) : DOTFILE_INCLUDES, globOptions),
	])

	const files = [...new Set([...regularFiles, ...dotFiles])]

	const discovered: DiscoveredFile[] = []

	for (const filePath of files) {
		const filename = basename(filePath)
		const entry = findParser(filename)
		if (entry) {
			discovered.push({
				filePath,
				parserName: entry.name,
				primary: entry.primary ?? false,
				priority: entry.priority,
				sourceKey: entry.sourceKey,
			})
		}
	}

	// Skip codemeta files when primary sources exist (idempotent generation)
	if (!retain && discovered.some((f) => f.primary)) {
		const filtered = discovered.filter((f) => f.parserName !== 'jsonld')
		discovered.length = 0
		discovered.push(...filtered)
	}

	discovered.sort((a, b) => a.priority - b.priority)

	return discovered
}
