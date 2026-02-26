/**
 * Java Maven pom.xml parser.
 * Emits CodeMeta RDF triples from Maven POM files.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { XMLParser } from 'fast-xml-parser'
import { readFileSync } from 'node:fs'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { codemeta, schema } from '../graph.js'
import { createPerson, emitOrganization, emitPerson } from '../person.js'

/**
 * Ensure a value is an array (XML parser may return single objects or arrays).
 */
function ensureArray<T>(value: T | T[] | undefined): T[] {
	if (is.nullOrUndefined(value)) return []
	return is.array(value) ? value : [value]
}

/**
 * Resolve Maven variable references in a string.
 */
function resolveVariable(
	value: string,
	variables: { artifactId?: string; groupId?: string },
): string {
	let resolved = value
	if (variables.groupId) {
		resolved = resolved.replace('${project.groupId}', variables.groupId)
	}

	if (variables.artifactId) {
		resolved = resolved.replace('${project.artifactId}', variables.artifactId)
	}

	return resolved
}

/**
 * Crosswalk keys that need parser-specific handling beyond what addPropertySmart
 * provides. These are skipped in the crosswalk loop and processed explicitly.
 */
const EXPLICIT_HANDLERS = new Set([
	'artifactId',
	'ciManagement',
	'contributors',
	// POM dependencies have groupId/artifactId/version/scope structure
	'dependencies',
	// XML container wrapping: <developers><developer>...</developer></developers>
	'developers',
	// Complex nested structure
	'distributionManagement',
	'downloadUrl',
	// Combined identifier from groupId.artifactId
	'groupId',
	'issueManagement',
	'license',
	// XML container wrapping: <licenses><license>...</license></licenses>
	'licenses',
	// Name needs Maven variable resolution
	'name',
	// Nested url subfield, need to filter $ variables
	'scm',
])

/**
 * Parse a pom.xml file and emit triples into the graph.
 */
export async function parseJava(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const parser = new XMLParser({
		ignoreAttributes: true,
		parseTagValue: false,
		removeNSPrefix: true,
	})
	const data: Record<string, unknown> = parser.parse(content)
	const warnings: string[] = []

	const project = data.project as Record<string, unknown> | undefined
	if (!project) {
		warnings.push('No <project> root element found in pom.xml')
		return warnings
	}

	graph.setType(subject, schema('SoftwareSourceCode'))
	graph.addString(subject, schema('runtimePlatform'), 'Java')
	graph.addString(subject, schema('programmingLanguage'), 'Java')

	const groupId = is.string(project.groupId) ? project.groupId : undefined
	const artifactId = is.string(project.artifactId) ? project.artifactId : undefined

	const metaMap = crosswalk.maps['Java (Maven)']

	// Phase 1: Crosswalk-driven mapping — handles version, description, url,
	// inceptionYear automatically
	for (const key of Object.keys(metaMap)) {
		if (EXPLICIT_HANDLERS.has(key)) continue
		const value = project[key]

		if (!is.nullOrUndefined(value) && !is.emptyStringOrWhitespace(value)) {
			graph.addPropertySmart(subject, metaMap[key as keyof typeof metaMap], value)
		}
	}

	// Phase 2: Explicit handlers for fields requiring parser-specific logic

	// Name — resolve Maven variables
	if (is.string(project.name) && is.nonEmptyStringAndNotWhitespace(project.name)) {
		graph.addString(subject, schema('name'), resolveVariable(project.name, { artifactId, groupId }))
	}

	// Identifier — combined groupId.artifactId
	if (groupId && artifactId) {
		graph.addString(subject, schema('identifier'), `${groupId}.${artifactId}`)
	}

	// SCM → codeRepository (filter out $ variables and empty URLs)
	if (is.plainObject(project.scm)) {
		const scm = project.scm as Record<string, unknown>
		if (
			is.string(scm.url) &&
			is.nonEmptyStringAndNotWhitespace(scm.url) &&
			!scm.url.includes('$')
		) {
			graph.addUrl(subject, schema('codeRepository'), scm.url)
		}
	}

	// Developers → author
	if (is.plainObject(project.developers)) {
		const container = project.developers as Record<string, unknown>
		for (const entry of ensureArray(
			container.developer as Array<Record<string, string>> | Record<string, string>,
		)) {
			if (!is.plainObject(entry)) continue
			if (!is.string(entry.name) || !is.nonEmptyStringAndNotWhitespace(entry.name)) continue
			const person = createPerson({
				email: is.string(entry.email) ? entry.email : undefined,
				name: entry.name,
				organization: is.string(entry.organization) ? entry.organization : undefined,
				url: is.string(entry.url) ? entry.url : undefined,
			})
			const node = emitPerson(person, graph)
			graph.add(subject, schema('author'), node)
		}
	}

	// Contributors
	if (is.plainObject(project.contributors)) {
		const container = project.contributors as Record<string, unknown>
		for (const entry of ensureArray(
			container.contributor as Array<Record<string, string>> | Record<string, string>,
		)) {
			if (!is.plainObject(entry)) continue
			if (!is.string(entry.name) || !is.nonEmptyStringAndNotWhitespace(entry.name)) continue
			const person = createPerson({
				email: is.string(entry.email) ? entry.email : undefined,
				name: entry.name,
				organization: is.string(entry.organization) ? entry.organization : undefined,
				url: is.string(entry.url) ? entry.url : undefined,
			})
			const node = emitPerson(person, graph)
			graph.add(subject, schema('contributor'), node)
		}
	}

	// Licenses — unwrap XML container, delegate to emitLicense
	if (is.plainObject(project.licenses)) {
		const container = project.licenses as Record<string, unknown>
		for (const entry of ensureArray(
			container.license as Array<Record<string, string>> | Record<string, string>,
		)) {
			if (is.plainObject(entry)) {
				graph.emitLicense(subject, entry)
			}
		}
	}

	// Dependencies — POM-specific structure with scope separation
	if (is.plainObject(project.dependencies)) {
		const container = project.dependencies as Record<string, unknown>
		for (const entry of ensureArray(
			container.dependency as Array<Record<string, string>> | Record<string, string>,
		)) {
			if (!is.plainObject(entry)) continue
			const depGroupId = is.string(entry.groupId) ? entry.groupId : undefined
			const depArtifactId = is.string(entry.artifactId) ? entry.artifactId : undefined
			if (!depGroupId || !depArtifactId) continue

			const isTest = entry.scope === 'test'
			const predicate = isTest ? codemeta('softwareSuggestions') : schema('softwareRequirements')

			const depNode = graph.blank()
			graph.setType(depNode, schema('SoftwareApplication'))
			graph.addString(depNode, schema('identifier'), `${depGroupId}.${depArtifactId}`)
			graph.addString(depNode, schema('name'), depArtifactId)
			if (is.string(entry.version) && !entry.version.startsWith('$')) {
				graph.addString(depNode, schema('version'), entry.version)
			}

			graph.add(subject, predicate, depNode)
		}
	}

	// CI management — extract url
	if (is.plainObject(project.ciManagement)) {
		const ci = project.ciManagement as Record<string, unknown>
		if (is.string(ci.url) && is.nonEmptyStringAndNotWhitespace(ci.url) && !ci.url.includes('$')) {
			graph.addUrl(subject, codemeta('continuousIntegration'), ci.url)
		}
	}

	// Issue management — extract url
	if (is.plainObject(project.issueManagement)) {
		const issues = project.issueManagement as Record<string, unknown>
		if (
			is.string(issues.url) &&
			is.nonEmptyStringAndNotWhitespace(issues.url) &&
			!issues.url.includes('$')
		) {
			graph.addUrl(subject, codemeta('issueTracker'), issues.url)
		}
	}

	// Organization → producer
	if (is.plainObject(project.organization)) {
		const org = project.organization as Record<string, unknown>
		if (is.string(org.name) && is.nonEmptyStringAndNotWhitespace(org.name)) {
			const orgNode = emitOrganization(
				{
					'@type': 'Organization',
					name: org.name,
					url: is.string(org.url) ? org.url : undefined,
				},
				graph,
			)
			graph.add(subject, schema('producer'), orgNode)
		}
	}

	// Mailing lists → email
	if (is.plainObject(project.mailingLists)) {
		const container = project.mailingLists as Record<string, unknown>
		for (const mailingList of ensureArray(
			container.mailingList as Array<Record<string, string>> | Record<string, string>,
		)) {
			if (
				is.plainObject(mailingList) &&
				is.string(mailingList.post) &&
				is.nonEmptyStringAndNotWhitespace(mailingList.post)
			) {
				graph.addString(subject, schema('email'), mailingList.post)
			}
		}
	}

	// Properties — extract java.version for runtimePlatform
	if (is.plainObject(project.properties)) {
		const props = project.properties as Record<string, unknown>
		if (is.string(props['java.version'])) {
			graph.removeProperty(subject, schema('runtimePlatform'))
			graph.addString(subject, schema('runtimePlatform'), `Java ${props['java.version']}`)
		}
	}

	return warnings
}
