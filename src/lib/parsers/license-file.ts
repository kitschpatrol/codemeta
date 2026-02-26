/**
 * License file parser.
 * Detects the SPDX license from LICENSE, LICENCE, COPYING, and UNLICENSE files.
 */

import type { NamedNode } from 'n3'
import { readFileSync } from 'node:fs'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { schema } from '../graph.js'
import { licenseToSpdx } from '../normalize.js'
import { identifyLicense } from '../utilities/license-matcher.js'

/**
 * Parse a license file and emit the detected SPDX license.
 * Only emits if no license has been set by other parsers.
 */
export async function parseLicenseFile(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	// Only suggest a license if none has been set by higher-precedence parsers
	if (graph.hasProperty(subject, schema('license'))) {
		return []
	}

	const content = readFileSync(filePath, 'utf8')
	const match = identifyLicense(content)

	if (match) {
		const spdxUri = licenseToSpdx(match.spdxId)
		graph.addUrl(subject, schema('license'), spdxUri)
	}

	return []
}
