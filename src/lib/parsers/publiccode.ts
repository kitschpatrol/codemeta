/**
 * Publiccode.yml / publiccode.yaml parser.
 * Emits CodeMeta RDF triples from publiccode.yml files.
 *
 * publiccode.yml is a metadata standard for public software repositories,
 * primarily used in Europe (Italy, Netherlands, etc.).
 * See: https://yml.publiccode.tools/
 *
 * Since the crosswalk.json doesn't include a publiccode mapping, this parser
 * defines its own field-to-property mapping inline.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { codemeta, schema } from '../graph.js'
import { statusToRepostatus } from '../normalize.js'
import { createPerson, emitOrganization, emitPerson } from '../person.js'

/**
 * Map publiccode.yml developmentStatus values to repostatus.org values.
 * See: https://yml.publiccode.tools/schema.core.html#key-developmentstatus
 */
const PUBLICCODE_STATUS_MAP: Record<string, string> = {
	beta: 'wip',
	concept: 'concept',
	development: 'wip',
	obsolete: 'inactive',
	stable: 'active',
}

/** Coerce YAML values that may be parsed as non-strings back to strings. */
function toString(value: unknown): string | undefined {
	if (is.string(value)) return value
	if (is.number(value)) return String(value)
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	return undefined
}

/** Check if a string looks like a date (YYYY-MM-DD). */
function isDateLike(value: string): boolean {
	return /^\d{4}-\d{1,2}-\d{1,2}/.test(value)
}

/** Normalize a URL-like string, prepending https:// if no protocol. */
function normalizeUrl(value: string): string {
	if (!value.startsWith('http://') && !value.startsWith('https://')) {
		return `https://${value}`
	}
	return value
}

/**
 * Parse a publiccode.yml file and emit triples into the graph.
 */
export async function parsePubliccode(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const data = parseYaml(content) as Record<string, unknown>
	const warnings: string[] = []

	if (!is.plainObject(data)) {
		warnings.push('Invalid publiccode.yml: not a YAML object')
		return warnings
	}

	graph.setType(subject, schema('SoftwareSourceCode'))

	// ─── Simple properties ─────────────────────────────────────────

	// name
	if (is.string(data.name)) {
		graph.addString(subject, schema('name'), data.name)
		const identifierIri = graph.propertyToIri('identifier')
		if (identifierIri) {
			graph.addString(subject, identifierIri, data.name)
		}
	}

	// URL → codeRepository (publiccode spec says this is always the repo URL)
	// Per crosswalk: url → schema:SoftwareSourceCode/codeRepository
	// Use emitRepository to normalize git:// URLs and strip .git suffix
	if (is.string(data.url) && data.url.trim() !== '') {
		graph.emitRepository(subject, data.url.trim())
	}

	// LandingURL → url
	if (is.string(data.landingURL) && data.landingURL.trim() !== '') {
		graph.addUrl(subject, schema('url'), normalizeUrl(data.landingURL))
	}

	// SoftwareVersion → version (YAML may parse "1.0" as number 1)
	const version = toString(data.softwareVersion)
	if (version) {
		graph.addString(subject, schema('version'), version)
	}

	// ReleaseDate → datePublished (validate: must be a date, not a URL or placeholder)
	const releaseDate = toString(data.releaseDate)
	if (releaseDate && isDateLike(releaseDate)) {
		graph.addString(subject, schema('datePublished'), releaseDate)
	}

	// Roadmap → relatedLink
	if (is.string(data.roadmap)) {
		graph.addUrl(subject, schema('relatedLink'), data.roadmap)
	}

	// IsBasedOn → isPartOf
	if (is.string(data.isBasedOn)) {
		graph.addUrl(subject, schema('isPartOf'), data.isBasedOn)
	}

	// ApplicationSuite → isPartOf (per crosswalk)
	if (is.string(data.applicationSuite)) {
		graph.addString(subject, schema('isPartOf'), data.applicationSuite)
	}

	// ─── developmentStatus ─────────────────────────────────────────

	if (is.string(data.developmentStatus)) {
		const lower = data.developmentStatus.toLowerCase()
		const repostatusValue = PUBLICCODE_STATUS_MAP[lower]
		if (repostatusValue) {
			graph.addUrl(
				subject,
				codemeta('developmentStatus'),
				`https://www.repostatus.org/#${repostatusValue}`,
			)
		} else {
			// Try generic statusToRepostatus for any direct repostatus values
			const repostatus = statusToRepostatus(data.developmentStatus)
			if (repostatus) {
				graph.addUrl(subject, codemeta('developmentStatus'), repostatus)
			}
		}
	}

	// ─── platforms → operatingSystem ───────────────────────────────

	if (is.array(data.platforms)) {
		for (const platform of data.platforms) {
			if (is.string(platform)) {
				graph.addString(subject, schema('operatingSystem'), platform)
			}
		}
	}

	// ─── categories → applicationSubCategory ──────────────────────
	// Per crosswalk: categories map to applicationSubCategory

	if (is.array(data.categories)) {
		for (const category of data.categories) {
			if (is.string(category)) {
				graph.addString(subject, schema('applicationSubCategory'), category)
			}
		}
	}

	// ─── Description (multi-language) ──────────────────────────────

	if (is.plainObject(data.description)) {
		const descriptions = data.description as Record<string, unknown>
		// Prefer English, fall back to first available language
		const lang = 'en' in descriptions ? 'en' : Object.keys(descriptions)[0]
		if (lang && is.plainObject(descriptions[lang])) {
			const desc = descriptions[lang] as Record<string, unknown>

			// ShortDescription → description (if no longDescription)
			// longDescription → description (preferred over shortDescription)
			if (is.string(desc.longDescription)) {
				graph.addString(subject, schema('description'), desc.longDescription.trim())
			} else if (is.string(desc.shortDescription)) {
				graph.addString(subject, schema('description'), desc.shortDescription.trim())
			}

			// GenericName → applicationCategory (per crosswalk)
			if (is.string(desc.genericName)) {
				graph.addString(subject, schema('applicationCategory'), desc.genericName)
			}

			// Documentation → softwareHelp
			if (is.string(desc.documentation)) {
				graph.addString(subject, schema('softwareHelp'), desc.documentation)
			}

			// Features → keywords
			if (is.array(desc.features)) {
				for (const feature of desc.features) {
					if (is.string(feature)) {
						graph.addProperty(subject, 'keywords', feature)
					} else if (is.plainObject(feature)) {
						// YAML may parse "key: value" strings as objects
						for (const [key, value] of Object.entries(feature as Record<string, unknown>)) {
							const combined = is.string(value) ? `${key}: ${value}` : key
							graph.addProperty(subject, 'keywords', combined)
						}
					}
				}
			}
		}
	}

	// ─── Legal section ─────────────────────────────────────────────

	if (is.plainObject(data.legal)) {
		const legal = data.legal as Record<string, unknown>

		// License (skip non-SPDX placeholders like "other")
		if (is.nonEmptyStringAndNotWhitespace(legal.license) && legal.license !== 'other') {
			graph.emitLicense(subject, legal.license as string)
		}

		// MainCopyrightOwner → copyrightHolder (skip empty strings)
		if (is.nonEmptyStringAndNotWhitespace(legal.mainCopyrightOwner)) {
			graph.emitPersonOrOrg(subject, schema('copyrightHolder'), legal.mainCopyrightOwner)
		}

		// RepoOwner → producer (Organization) (skip empty strings)
		if (is.nonEmptyStringAndNotWhitespace(legal.repoOwner)) {
			const orgNode = emitOrganization({ '@type': 'Organization', name: legal.repoOwner }, graph)
			graph.add(subject, schema('producer'), orgNode)
		}
	}

	// ─── Maintenance section ───────────────────────────────────────

	if (is.plainObject(data.maintenance)) {
		const maintenance = data.maintenance as Record<string, unknown>

		// Contacts → maintainer (skip contacts with empty names)
		if (is.array(maintenance.contacts)) {
			for (const contact of maintenance.contacts) {
				if (is.plainObject(contact)) {
					const c = contact as Record<string, unknown>
					if (is.nonEmptyStringAndNotWhitespace(c.name)) {
						const person = createPerson({
							email: is.nonEmptyStringAndNotWhitespace(c.email) ? (c.email as string) : undefined,
							name: c.name as string,
						})
						const node = emitPerson(person, graph)
						graph.add(subject, codemeta('maintainer'), node)
					}
				}
			}
		}

		// Contractors → contributor (skip contractors with empty names)
		if (is.array(maintenance.contractors)) {
			for (const contractor of maintenance.contractors) {
				if (is.plainObject(contractor)) {
					const c = contractor as Record<string, unknown>
					if (is.nonEmptyStringAndNotWhitespace(c.name)) {
						const orgNode = emitOrganization(
							{
								'@type': 'Organization',
								name: c.name,
								...(is.string(c.website) ? { url: c.website } : {}),
							},
							graph,
						)
						graph.add(subject, schema('contributor'), orgNode)
					}
				}
			}
		}
	}

	// ─── dependsOn → softwareRequirements ──────────────────────────

	if (is.plainObject(data.dependsOn)) {
		const dependsOn = data.dependsOn as Record<string, unknown>
		for (const category of ['open', 'proprietary', 'hardware']) {
			if (is.array(dependsOn[category])) {
				for (const dep of dependsOn[category]) {
					if (is.plainObject(dep)) {
						const d = dep as Record<string, unknown>
						if (is.string(d.name)) {
							const vMin = toString(d.versionMin)
							const vExact = toString(d.version)
							const depMap: Record<string, string> = {
								[d.name]: vMin ? `>= ${vMin}` : (vExact ?? ''),
							}
							graph.emitDependencies(subject, schema('softwareRequirements'), depMap)
						}
					}
				}
			}
		}
	}

	// ─── inputTypes / outputTypes → encoding ───────────────────────

	if (is.array(data.inputTypes, is.string)) {
		for (const mimeType of data.inputTypes) {
			graph.addString(subject, schema('fileFormat'), mimeType)
		}
	}

	if (is.array(data.outputTypes, is.string)) {
		for (const mimeType of data.outputTypes) {
			graph.addString(subject, schema('fileFormat'), mimeType)
		}
	}

	return warnings
}
