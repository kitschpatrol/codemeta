/**
 * GoReleaser (.goreleaser.yml / .goreleaser.yaml) parser.
 * Emits CodeMeta RDF triples from goreleaser configuration files.
 *
 * GoReleaser is a Go-specific release tool. Metadata is scattered across
 * multiple sections (nfpms, brews, scoops, snapcrafts, chocolateys, winget,
 * aurs, homebrew_casks). This parser aggregates them with a defined priority.
 *
 * Since the crosswalk.json doesn't include a goreleaser mapping, this parser
 * defines its own field-to-property mapping inline.
 */

import type { NamedNode } from 'n3'
import is from '@sindresorhus/is'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import type { Crosswalk } from '../crosswalk.js'
import type { CodeMetaGraph } from '../graph.js'
import { COMMON_SOURCEREPOS } from '../constants.js'
import { codemeta, schema } from '../graph.js'
import { emitOrganization } from '../person.js'

/** Map Go OS identifiers to human-readable names */
const GOOS_MAP: Record<string, string> = {
	aix: 'AIX',
	android: 'Android',
	darwin: 'macOS',
	dragonfly: 'DragonFly BSD',
	freebsd: 'FreeBSD',
	illumos: 'illumos',
	ios: 'iOS',
	js: 'JavaScript',
	linux: 'Linux',
	netbsd: 'NetBSD',
	openbsd: 'OpenBSD',
	plan9: 'Plan 9',
	solaris: 'Solaris',
	wasip1: 'WASI',
	windows: 'Windows',
}

/**
 * Get the first non-empty string value of a given field from an array of
 * package-manager section entries. Skips Go template strings (containing `{{`).
 */
function firstString(sections: unknown[], field: string): string | undefined {
	for (const section of sections) {
		if (is.plainObject(section)) {
			const value = (section as Record<string, unknown>)[field]
			if (is.nonEmptyStringAndNotWhitespace(value) && !value.includes('{{')) {
				return value.trim()
			}
		}
	}

	return undefined
}

/**
 * Collect all section entries for a given key, handling both v1 singular
 * and v2 plural forms. Returns a flat array of section objects.
 */
function collectSections(data: Record<string, unknown>, ...keys: string[]): unknown[] {
	const result: unknown[] = []
	for (const key of keys) {
		const value = data[key]
		if (is.array(value)) {
			result.push(...value)
		} else if (is.plainObject(value)) {
			result.push(value)
		}
	}

	return result
}

/**
 * Parse a .goreleaser.yml/.yaml file and emit triples into the graph.
 */
export async function parseGoreleaser(
	filePath: string,
	graph: CodeMetaGraph,
	subject: NamedNode,
	_crosswalk: Crosswalk,
): Promise<string[]> {
	const content = readFileSync(filePath, 'utf8')
	const warnings: string[] = []

	let data: Record<string, unknown>
	try {
		data = parseYaml(content) as Record<string, unknown>
	} catch (error) {
		warnings.push(
			`Invalid goreleaser config: ${error instanceof Error ? error.message : String(error)}`,
		)
		return warnings
	}

	if (!is.plainObject(data)) {
		warnings.push('Invalid goreleaser config: not a YAML object')
		return warnings
	}

	graph.setType(subject, schema('SoftwareSourceCode'))

	// ─── project_name → name ──────────────────────────────────────

	if (is.nonEmptyStringAndNotWhitespace(data.project_name)) {
		graph.addString(subject, schema('name'), data.project_name)
	}

	// ─── Inferred: programmingLanguage = Go ───────────────────────

	graph.addString(subject, schema('programmingLanguage'), 'Go')

	// ─── Collect package manager sections (priority order) ────────

	// Priority: nfpms > brews/homebrew_casks > snapcrafts > scoops > chocolateys > winget > aurs
	const nfpms = collectSections(data, 'nfpms', 'nfpm')
	const brews = collectSections(data, 'brews', 'brew', 'homebrew_casks')
	const snaps = collectSections(data, 'snapcrafts', 'snapcraft')
	const scoops = collectSections(data, 'scoops', 'scoop')
	const chocs = collectSections(data, 'chocolateys', 'chocolatey')
	const winget = collectSections(data, 'winget')
	const aurs = collectSections(data, 'aurs', 'aur')

	const allSections = [...nfpms, ...brews, ...snaps, ...scoops, ...chocs, ...winget, ...aurs]

	// ─── description ──────────────────────────────────────────────

	const description =
		firstString(allSections, 'description') ??
		firstString(snaps, 'summary') ??
		firstString(chocs, 'summary') ??
		firstString(winget, 'short_description')
	if (description) {
		graph.addString(subject, schema('description'), description)
	}

	// ─── homepage → url (and maybe codeRepository) ────────────────

	const homepage = firstString(allSections, 'homepage') ?? firstString(chocs, 'project_url')
	if (homepage) {
		graph.addUrl(subject, schema('url'), homepage)
		if (!graph.hasProperty(subject, schema('codeRepository'))) {
			for (const sourceRepo of COMMON_SOURCEREPOS) {
				if (homepage.startsWith(sourceRepo)) {
					graph.emitRepository(subject, homepage)
					break
				}
			}
		}
	}

	// ─── license ──────────────────────────────────────────────────

	const license = firstString(allSections, 'license')
	if (license) {
		graph.emitLicense(subject, license)
	}

	// ─── maintainer (Person) ──────────────────────────────────────

	const maintainer = firstString(nfpms, 'maintainer') ?? firstString(aurs, 'maintainer')
	if (maintainer) {
		graph.emitPersonOrOrg(subject, codemeta('maintainer'), maintainer)
	}

	// Also check aurs[].maintainers (array of strings)
	if (!maintainer) {
		for (const section of aurs) {
			if (is.plainObject(section)) {
				const { maintainers } = section as Record<string, unknown>
				if (is.array(maintainers)) {
					for (const m of maintainers) {
						if (is.nonEmptyStringAndNotWhitespace(m)) {
							graph.emitPersonOrOrg(subject, codemeta('maintainer'), m)
						}
					}

					break
				}
			}
		}
	}

	// ─── vendor → author (Organization) ───────────────────────────

	const vendor =
		firstString(nfpms, 'vendor') ?? firstString(chocs, 'owners') ?? firstString(winget, 'publisher')
	if (vendor) {
		const orgNode = emitOrganization({ '@type': 'Organization', name: vendor }, graph)
		graph.add(subject, schema('author'), orgNode)
	}

	// Also check chocolateys authors
	if (!vendor) {
		const authors = firstString(chocs, 'authors')
		if (authors) {
			graph.emitPersonOrOrg(subject, schema('author'), authors)
		}
	}

	// ─── release.github/gitlab → codeRepository ──────────────────

	if (!graph.hasProperty(subject, schema('codeRepository')) && is.plainObject(data.release)) {
		const release = data.release as Record<string, unknown>
		if (is.plainObject(release.github)) {
			const gh = release.github as Record<string, unknown>
			if (is.string(gh.owner) && is.string(gh.name)) {
				graph.addUrl(subject, schema('codeRepository'), `https://github.com/${gh.owner}/${gh.name}`)
			}
		} else if (is.plainObject(release.gitlab)) {
			const gl = release.gitlab as Record<string, unknown>
			if (is.string(gl.owner) && is.string(gl.name)) {
				graph.addUrl(subject, schema('codeRepository'), `https://gitlab.com/${gl.owner}/${gl.name}`)
			}
		}
	}

	// ─── builds[].goos → operatingSystem ──────────────────────────

	const goosSet = new Set<string>()
	const builds = collectSections(data, 'builds', 'build')
	for (const build of builds) {
		if (is.plainObject(build)) {
			const { goos } = build as Record<string, unknown>
			if (is.array(goos)) {
				for (const os of goos) {
					if (is.string(os)) {
						goosSet.add(os.toLowerCase())
					}
				}
			}
		}
	}

	for (const os of goosSet) {
		const readable = GOOS_MAP[os] ?? os.charAt(0).toUpperCase() + os.slice(1)
		graph.addString(subject, schema('operatingSystem'), readable)
	}

	// ─── keywords (from chocolateys tags / winget tags) ───────────

	for (const section of chocs) {
		if (is.plainObject(section)) {
			const { tags } = section as Record<string, unknown>
			if (is.nonEmptyStringAndNotWhitespace(tags)) {
				for (const tag of tags.split(/\s+/)) {
					if (tag.length > 0) {
						graph.addProperty(subject, 'keywords', tag)
					}
				}

				break
			}
		}
	}

	for (const section of winget) {
		if (is.plainObject(section)) {
			const { tags } = section as Record<string, unknown>
			if (is.array(tags)) {
				for (const tag of tags) {
					if (is.nonEmptyStringAndNotWhitespace(tag)) {
						graph.addProperty(subject, 'keywords', tag)
					}
				}

				break
			}
		}
	}

	// ─── issueTracker (from chocolateys bug_tracker_url) ──────────

	const bugTracker =
		firstString(chocs, 'bug_tracker_url') ?? firstString(winget, 'publisher_support_url')
	if (bugTracker) {
		graph.addUrl(subject, codemeta('issueTracker'), bugTracker)
	}

	return warnings
}
