/**
 * README parser.
 * Extracts the first H1 heading from a README file and suggests it as a name.
 */

import type { Nodes, PhrasingContent } from 'mdast'
import type { NamedNode } from 'n3'
import { readFileSync } from 'node:fs'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { schema } from '../graph.js'

/**
 * Parse a README file and emit the first H1 heading as the software name.
 * Only emits if no name has been set by other parsers.
 */
export async function parseReadme(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	// Only suggest a name if none has been set by higher-precedence parsers
	if (graph.hasProperty(subject, schema('name'))) {
		return []
	}

	const content = readFileSync(filePath, 'utf8')
	const name = extractFirstH1(content)

	if (name) {
		graph.addString(subject, schema('name'), name)
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
