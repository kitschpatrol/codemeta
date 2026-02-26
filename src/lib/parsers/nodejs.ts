// @case-police-ignore Typescript, Javascript

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { get } from 'es-toolkit/compat'
import { readFile } from 'node:fs/promises'
// Alternatives do not normalize as aggressively
// eslint-disable-next-line depend/ban-dependencies
import { parsePackage } from 'read-pkg'
/**
 * Node.js package.json parser.
 * Emits CodeMeta RDF triples from npm package.json files.
 */
import { t } from 'try'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { COMMON_SOURCEREPOS } from '../constants.js'
import { schema } from '../graph.js'

/**
 * Source fields that need parser-specific handling beyond what addPropertySmart
 * provides. These are skipped in the crosswalk loop and processed explicitly.
 */
const EXPLICIT_HANDLERS = new Set([
	// Homepage has dual-emit logic (url + maybe codeRepository)
	'homepage',
])

/**
 * Parse a package.json file and emit triples into the graph.
 * @returns A list of warning message strings
 */
export async function parseNodejs(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
): Promise<string[]> {
	// Load, parse, and normalize package.json
	// See https://github.com/npm/normalize-package-data#what-normalization-currently-entails
	const content = await readFile(filePath, 'utf8')
	const [ok, error, packageData] = t(() => parsePackage(content))
	if (!ok) {
		return [`Error parsing ${filePath}: ${error instanceof Error ? error.message : String(error)}`]
	}

	const metaMap = crosswalk.maps.NodeJS

	// Phase 1: Crosswalk-driven mapping — addPropertySmart handles name
	// normalization, repository URL cleanup, engine formatting, author/contributor
	// Person creation, license SPDX conversion, and dependency emission automatically
	for (const key of Object.keys(metaMap)) {
		if (EXPLICIT_HANDLERS.has(key)) continue
		const value = get(packageData, key)

		if (!is.nullOrUndefined(value) && !is.emptyStringOrWhitespace(value)) {
			graph.addPropertySmart(subject, metaMap[key as keyof typeof metaMap], value)
		}
	}

	// Phase 2: Explicit handlers for fields requiring parser-specific logic

	// Homepage — emit as url, and also as codeRepository if it looks like a source repo
	if (is.string(packageData.homepage)) {
		graph.addUrl(subject, schema('url'), packageData.homepage)
		if (!graph.hasProperty(subject, schema('codeRepository'))) {
			for (const sourceRepo of COMMON_SOURCEREPOS) {
				if (packageData.homepage.startsWith(sourceRepo)) {
					graph.addUrl(subject, schema('codeRepository'), packageData.homepage)
					break
				}
			}
		}
	}

	// Detect programming language from devDependencies
	const hasTypeScript =
		is.plainObject(packageData.devDependencies) && 'typescript' in packageData.devDependencies
	graph.addString(
		subject,
		schema('programmingLanguage'),
		hasTypeScript ? 'Typescript' : 'Javascript',
	)

	return []
}
