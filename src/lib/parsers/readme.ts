/**
 * README parser.
 * Extracts the first H1 heading from a README file and suggests it as a name.
 * Also emits the readme file path/URL as `codemeta:readme`.
 */

import type { Nodes, PhrasingContent } from 'mdast'
import type { NamedNode } from 'n3'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { readmeWebUrl } from '../constants.js'
import { codemeta, schema } from '../graph.js'

/**
 * Parse a README file and emit the first H1 heading as the software name.
 * Also emits `codemeta:readme` with a web URL (if a known source forge
 * repository is set) or the filename as a fallback.
 * Only emits each property if not already set by higher-precedence parsers.
 */
export async function parseReadme(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')

	// Suggest name from H1 heading if not already set
	if (!graph.hasProperty(subject, schema('name'))) {
		const name = extractFirstH1(content)
		if (name) {
			graph.addString(subject, schema('name'), name)
		}
	}

	// Emit readme path/URL if not already set by another parser
	if (!graph.hasProperty(subject, codemeta('readme'))) {
		const filename = basename(filePath)
		const repos = graph.getValues(subject, schema('codeRepository'))
		const url = repos.length > 0 ? readmeWebUrl(repos[0], filename) : undefined
		if (url) {
			graph.addUrl(subject, codemeta('readme'), url)
		} else {
			graph.addString(subject, codemeta('readme'), filename)
		}
	}

	return []
}

/**
 * Extract the text content of the first H1 heading from markdown.
 */
function extractFirstH1(markdown: string): string | undefined {
	const tree = unified().use(remarkParse).parse(markdown)

	for (const node of tree.children) {
		if (node.type === 'heading' && node.depth === 1) {
			const text = extractText(node.children)
			if (text.length > 0) {
				return text
			}
		}
	}

	return undefined
}

/**
 * Recursively extract plain text from mdast phrasing content.
 */
function extractText(nodes: Nodes[] | PhrasingContent[]): string {
	return nodes
		.map((node) => {
			if ('value' in node) return node.value
			if ('children' in node) return extractText(node.children)
			return ''
		})
		.join('')
		.trim()
}
