/**
 * Simplified CodeMeta types using only plain TypeScript primitives.
 *
 * Unlike the full {@link CodeMeta} type (which uses complex `schema-dts` union
 * types), these types use only `string`, `number`, `boolean`, and simple object
 * interfaces. Every property has a predictable shape — either always singular
 * or always an array — so consumers never need to check `Array.isArray()`.
 *
 * JSON-LD boilerplate (`@context`, `@type`, `@id`) is stripped.
 */

// ─── Nested object types ─────────────────────────────────────────────

/** A person or organization with only simple string fields. */
export type BasicPersonOrOrg = {
	email?: string
	familyName?: string
	givenName?: string
	name?: string
	type: 'Organization' | 'Person'
	url?: string
}

/** A software dependency with only simple string fields. */
export type BasicDependency = {
	identifier?: string
	name?: string
	runtimePlatform?: string
	type: 'SoftwareSourceCode'
	version?: string
}

// ─── Main type ───────────────────────────────────────────────────────

/**
 * A normalized CodeMeta record using only plain types.
 *
 * - No JSON-LD boilerplate (`@context`, `@type`, `@id`)
 * - No `schema-dts` union types — values are `string`, `number`, `boolean`,
 *   or simple object interfaces
 * - Every property is predictably singular or array, never `T | T[]`
 */
export type CodeMetaBasic = {
	// ─── Always singular (string) ─────────────────────────────────

	/** Index signature for any additional properties not covered above. */
	[key: string]: unknown
	/** Type of software application, e.g. 'Game, Multimedia'. */
	applicationCategory?: string
	/** Subcategory of the application, e.g. 'Arcade Game'. */
	applicationSubCategory?: string
	/** The author(s) of the software. Always an array. */
	author?: BasicPersonOrOrg[]
	/** Link(s) to installation instructions. Always an array. */
	buildInstructions?: string[]
	/** Citation(s) or references. Always an array. */
	citation?: string[]
	/** Link to the repository where the un-compiled, human-readable code is located. */
	codeRepository?: string
	/** Link(s) to continuous integration service. Always an array. */
	continuousIntegration?: string[]
	/** Secondary contributor(s). Always an array. */
	contributor?: BasicPersonOrOrg[]
	/** The party holding the legal copyright. Always an array. */
	copyrightHolder?: BasicPersonOrOrg[]
	/** The year during which the claimed copyright was first asserted. */
	copyrightYear?: number
	/** The date on which the work was created (YYYY-MM-DD). */
	dateCreated?: string
	/** The date on which the work was most recently modified (YYYY-MM-DD). */
	dateModified?: string
	/** Date of first publication (YYYY-MM-DD). */
	datePublished?: string
	/** A description of the item. */
	description?: string
	/** Development status, e.g. 'active', 'inactive', or a repostatus.org URL. */
	developmentStatus?: string
	/** URL to download the binary. */
	downloadUrl?: string
	/** Editor(s) of the work. Always an array. */
	editor?: BasicPersonOrOrg[]
	/** Media type(s), typically MIME format. Always an array. */
	fileFormat?: string[]
	/** Financial supporter(s). Always an array. */
	funder?: BasicPersonOrOrg[]
	/** Funding source (e.g. specific grant). */
	funding?: string
	/** An identifier (ISBN, GTIN, UUID, DOI, etc.). */
	identifier?: string
	/** URL to install the application, if different from the item URL. */
	installUrl?: string
	/** Whether the publication is accessible for free. */
	isAccessibleForFree?: boolean
	/** Link to bug reporting or issue tracking system. */
	issueTracker?: string
	// ─── Always arrays (PersonOrOrg) ──────────────────────────────
	/** Keywords or tags. Always an array. */
	keywords?: string[]
	/** License URL(s) (typically SPDX URIs like http://spdx.org/licenses/MIT). Always an array. */
	license?: string[]
	/** Maintainer(s) of the software. Always an array. */
	maintainer?: BasicPersonOrOrg[]
	/** Memory requirements. Always an array. */
	memoryRequirements?: string[]
	/** The name of the software. */
	name?: string
	/** Supported operating system(s). Always an array. */
	operatingSystem?: string[]
	/** Permission(s) required to run the app. Always an array. */
	permissions?: string[]
	/** The position of the item in a series or sequence. */
	position?: number | string
	/** Processor architecture(s) required. Always an array. */
	processorRequirements?: string[]
	// ─── Always arrays (dependencies) ─────────────────────────────
	/** Producer(s) of the work. Always an array. */
	producer?: BasicPersonOrOrg[]
	/** The programming language(s) used. Always an array. */
	programmingLanguage?: string[]
	// ─── Always arrays (strings) ──────────────────────────────────
	/** Publisher(s) of the work. Always an array. */
	publisher?: BasicPersonOrOrg[]
	/** Link to the software readme. */
	readme?: string
	/** A related link, e.g. related web pages. */
	relatedLink?: string
	/** Description of what changed in this version. */
	releaseNotes?: string
	/** Runtime platform or interpreter dependencies. Always an array. */
	runtimePlatform?: string[]
	/** URL(s) that unambiguously indicate the item's identity. Always an array. */
	sameAs?: string[]
	/** Software application help URL or description. */
	softwareHelp?: string
	/** Required software dependencies. Always an array. */
	softwareRequirements?: BasicDependency[]
	/** Optional software dependencies. Always an array. */
	softwareSuggestions?: BasicDependency[]
	/** Version of the software. */
	softwareVersion?: string
	/** Sponsor(s) of the work. Always an array. */
	sponsor?: BasicPersonOrOrg[]
	/** Storage requirements. Always an array. */
	storageRequirements?: string[]
	/** URL of the item. */
	url?: string
	/** The version of the work. */
	version?: string
}
