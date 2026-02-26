/* eslint-disable ts/no-redundant-type-constituents */

/**
 * Core TypeScript types for CodeMeta entities.
 * Based on the CodeMeta 3.0 specification and schema.org vocabulary.
 */

import type {
	Boolean,
	ComputerLanguage,
	CreativeWork,
	DataFeed,
	Date,
	Integer,
	MediaObject,
	Number,
	Organization,
	Person,
	PropertyValue,
	Review,
	ScholarlyArticle,
	SoftwareApplication,
	SoftwareSourceCode,
	Text,
	URL,
	WebApplication,
} from 'schema-dts'

// Additional software types coming in CodeMeta 4.0
import type { CommandLineApplication, DesktopApplication, SoftwareLibrary } from './types-software'

// From https://github.com/sindresorhus/type-fest/blob/main/source/simplify.d.ts
type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {}

type Type = 'SoftwareApplication' | 'SoftwareSourceCode'

/**
 * Development status values
 * @see https://www.repostatus.org
 */
type DevelopmentStatus =
	| 'abandoned'
	| 'active'
	| 'concept'
	| 'inactive'
	| 'suspended'
	| 'wip'
	| (string & {})

/**
 * The CodeMeta project also introduces the following additional properties, which
 * lack clear equivalents in https://schema.org but can play an important role in
 * software metadata records covered by the CodeMeta crosswalk.
 * @see https://codemeta.github.io/terms/#codemeta-terms
 */
type CodeMetaTerms = {
	/**
	 * A link to installation instructions/documentation
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	buildInstructions?: URL | URL[]
	/**
	 * A link to continuous integration service
	 * This is a CodeMeta-specific additional property.
	 * v3
	 */
	continuousIntegration?: URL | URL[]
	/**
	 * Description of development status, e.g. active, inactive, suspended. See repostatus.org
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	developmentStatus?: DevelopmentStatus | DevelopmentStatus[]
	/**
	 * Software may be embargoed from public access until a specified date (e.g. pending publication, 1 year from publication)
	 * This is a CodeMeta-specific additional property.
	 * v3
	 */
	embargoEndDate?: Date | Date[]
	/**
	 * Funding source (e.g. specific grant)
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	funding?: Text | Text[]
	/**
	 * A link that states where the software code is for a given software. For example a software registry may indicate that one of its software entries hasSourceCode in a GitHub repository.
	 * This is a CodeMeta-specific additional property.
	 * v3
	 */
	hasSourceCode?: SoftwareSourceCode | SoftwareSourceCode[]
	/**
	 * A link that states where software application is built from a given source code.
	 * This is the reverse property of 'hasSourceCode'.
	 * This is a CodeMeta-specific additional property.
	 *
	 * The type has been extended beyond the 3.0 Codemeta spec to include
	 * additional optional software types beyond SoftwareApplication
	 * @see https://github.com/codemeta/codemeta/issues/271
	 * v3
	 */
	isSourceCodeOf?:
		| Array<
				| CommandLineApplication
				| DesktopApplication
				| SoftwareApplication
				| SoftwareLibrary
				| WebApplication
		  >
		| CommandLineApplication
		| DesktopApplication
		| SoftwareApplication
		| SoftwareLibrary
		| WebApplication
	/**
	 * A link to software bug reporting or issue tracking system
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	issueTracker?: URL | URL[]
	/**
	 * Individual responsible for maintaining the software (usually includes an email contact address)
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	maintainer?: Person | Person[]
	/**
	 * A link to software Readme file
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	readme?: URL | URL[]
	/**
	 * An academic publication related to the software.
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	referencePublication?: ScholarlyArticle | ScholarlyArticle[]
	/**
	 * Optional dependencies, e.g. for optional features, code development, etc.
	 * This is a CodeMeta-specific additional property.
	 * v2, v3
	 */
	softwareSuggestions?: SoftwareSourceCode | SoftwareSourceCode[]
}

/**
 * Recognized properties for CodeMeta SoftwareSourceCode and SoftwareApplication
 * includes the following terms from https://schema.org. These terms are part of
 * the CodeMeta specification and can be used without any prefix.
 * @see https://codemeta.github.io/terms/#schemaorg-software-terms
 */
type SchemaOrgSoftwareTerms = {
	/**
	 * Type of software application, e.g. 'Game, Multimedia'.
	 * V2, v3
	 */
	applicationCategory?: Array<Text | URL> | Text | URL
	/**
	 * Subcategory of the application, e.g. 'Arcade Game'.
	 * V2, v3
	 */
	applicationSubCategory?: Array<Text | URL> | Text | URL
	/**
	 * The author of this content or rating. Please note that author is special in that HTML 5 provides a special mechanism for indicating authorship via the rel tag. That is equivalent to this and may be used interchangeably.
	 * V2, v3
	 */
	author?: Array<Organization | Person> | Organization | Person
	/**
	 * A citation or reference to another creative work, such as another publication, web page, scholarly article, etc.
	 * V2, v3
	 */
	citation?: Array<CreativeWork | URL> | CreativeWork | URL
	/**
	 * A link to the repository where the un-compiled, human readable code and related code is located (SVN, GitHub, CodePlex, institutional GitLab instance, etc.).
	 * V2, v3
	 */
	codeRepository?: URL | URL[]
	/**
	 * A secondary contributor to the CreativeWork or Event.
	 * V2, v3
	 */
	contributor?: Array<Organization | Person> | Organization | Person
	/**
	 * The party holding the legal copyright to the CreativeWork.
	 * V2, v3
	 */
	copyrightHolder?: Array<Organization | Person> | Organization | Person
	/**
	 * The year during which the claimed copyright for the CreativeWork was first asserted.
	 * V2, v3
	 */
	copyrightYear?: Number | Number[]
	/**
	 * The date on which the CreativeWork was created or the item was added to a DataFeed.
	 * V2, v3
	 */
	dateCreated?: Date | Date[]
	/**
	 * The date on which the CreativeWork was most recently modified or when the item's entry was modified within a DataFeed.
	 * V2, v3
	 */
	dateModified?: Date | Date[]
	/**
	 * Date of first broadcast/publication.
	 * V2, v3
	 */
	datePublished?: Date | Date[]
	/**
	 * A description of the item.
	 * V2, v3
	 */
	description?: Text | Text[]
	/**
	 * If the file can be downloaded, URL to download the binary.
	 * V2, v3
	 */
	downloadUrl?: URL | URL[]
	/**
	 * Specifies the Person who edited the CreativeWork.
	 * V2, v3
	 */
	editor?: Person | Person[]
	/**
	 * A media object that encodes this CreativeWork. This property is a synonym for associatedMedia. Supersedes encodings.
	 * V2, v3
	 */
	encoding?: MediaObject | MediaObject[]
	/**
	 * Media type, typically MIME format (see IANA site) of the content e.g. application/zip of a SoftwareApplication binary. In cases where a CreativeWork has several media type representations, 'encoding' can be used to indicate each MediaObject alongside particular fileFormat information. Unregistered or niche file formats can be indicated instead via the most appropriate URL, e.g. defining Web page or a Wikipedia entry.
	 * V2, v3
	 */
	fileFormat?: Array<Text | URL> | Text | URL
	/**
	 * Size of the application / package (e.g. 18MB). In the absence of a unit (MB, KB etc.), KB will be assumed.
	 * V2, v3
	 */
	fileSize?: Text | Text[]
	/**
	 * A person or organization that supports (sponsors) something through some kind of financial contribution.
	 * V2, v3
	 */
	funder?: Array<Organization | Person> | Organization | Person
	/**
	 * Indicates a CreativeWork that is (in some sense) a part of this CreativeWork. Reverse property isPartOf
	 * V2, v3
	 */
	hasPart?: CreativeWork | CreativeWork[]
	/**
	 * The identifier property represents any kind of identifier for any kind of Thing, such as ISBNs, GTIN codes, UUIDs etc. Schema.org provides dedicated properties for representing many of these, either as textual strings or as URL (URI) links. See background notes for more details.
	 * V2, v3
	 */
	identifier?: Array<PropertyValue | URL> | PropertyValue | URL
	/**
	 * URL at which the app may be installed, if different from the URL of the item.
	 * V2, v3
	 */
	installUrl?: URL | URL[]
	/**
	 * A flag to signal that the publication is accessible for free.
	 * V2, v3
	 */
	isAccessibleForFree?: Boolean
	/**
	 * Indicates a CreativeWork that this CreativeWork is (in some sense) part of. Reverse property hasPart
	 * V2, v3
	 */
	isPartOf?: CreativeWork | CreativeWork[]
	/**
	 * Keywords or tags used to describe this content. Multiple entries in a keywords list are typically delimited by commas.
	 * V2, v3
	 */
	keywords?: Text | Text[]
	/**
	 * A license document that applies to this content, typically indicated by URL.
	 * V2, v3
	 */
	license?: Array<CreativeWork | URL> | CreativeWork | URL
	/**
	 * Minimum memory requirements.
	 * V2, v3
	 */
	memoryRequirements?: Array<Text | URL> | Text | URL
	/**
	 * The name of the item (software, Organization)
	 * V2, v3
	 */
	name?: Text | Text[]
	/**
	 * Operating systems supported (Windows 7, OSX 10.6, Android 1.6).
	 * V2, v3
	 */
	operatingSystem?: Text | Text[]
	/**
	 * Permission(s) required to run the app (for example, a mobile app may require full internet access or may run only on wifi).
	 * V2, v3
	 */
	permissions?: Text | Text[]
	/**
	 * The position of an item in a series or sequence of items. (While schema.org considers this a property of CreativeWork, it is also the way to indicate ordering in any list (e.g. the Authors list). By default arrays are unordered in JSON-LD
	 * V2, v3
	 */
	position?: Array<Integer | Text> | Integer | Text
	/**
	 * Processor architecture required to run the application (e.g. IA64).
	 * V2, v3
	 */
	processorRequirements?: Text | Text[]
	/**
	 * The person or organization who produced the work (e.g. music album, movie, tv/radio series etc.).
	 * V2, v3
	 */
	producer?: Array<Organization | Person> | Organization | Person
	/**
	 * The computer programming language.
	 * V2, v3
	 */
	programmingLanguage?: Array<ComputerLanguage | Text> | ComputerLanguage | Text
	/**
	 * The service provider, service operator, or service performer; the goods producer. Another party (a seller) may offer those services or goods on behalf of the provider. A provider may also serve as the seller. Supersedes carrier.
	 * V2, v3
	 */
	provider?: Array<Organization | Person> | Organization | Person
	/**
	 * The publisher of the creative work.
	 * V2, v3
	 */
	publisher?: Array<Organization | Person> | Organization | Person
	/**
	 * A link related to this object, e.g. related web pages
	 * V2, v3
	 */
	relatedLink?: URL | URL[]
	/**
	 * Description of what changed in this version.
	 * V2, v3
	 */
	releaseNotes?: Array<Text | URL> | Text | URL
	/**
	 * A review of the source code.
	 * V3
	 */
	review?: Review | Review[]
	/**
	 * Runtime platform or script interpreter dependencies (Example - Java v1, Python2.3, .Net Framework 3.0). Supersedes runtime.
	 * V2, v3
	 */
	runtimePlatform?: Text | Text[]
	/**
	 * URL of a reference Web page that unambiguously indicates the item's identity. E.g. the URL of the item's Wikipedia page, Wikidata entry, or official website.
	 * V2, v3
	 */
	sameAs?: URL | URL[]
	/**
	 * Software application help.
	 * V2, v3
	 */
	softwareHelp?: CreativeWork | CreativeWork[]
	/**
	 * Required software dependencies
	 * V2, v3
	 */
	softwareRequirements?: SoftwareSourceCode | SoftwareSourceCode[]
	/**
	 * V2, v3
	 * Version of the software instance.
	 */
	softwareVersion?: Text | Text[]
	/**
	 * A person or organization that supports a thing through a pledge, promise, or financial contribution. e.g. a sponsor of a Medical Study or a corporate sponsor of an event.
	 * V2, v3
	 */
	sponsor?: Array<Organization | Person> | Organization | Person
	/**
	 * Storage requirements (free space required).
	 * V2, v3
	 */
	storageRequirements?: Array<Text | URL> | Text | URL
	/**
	 * Supporting data for a SoftwareApplication.
	 * V2, v3
	 */
	supportingData?: DataFeed | DataFeed[]
	/**
	 * Target Operating System / Product to which the code applies. If applies to several versions, just the product name can be used.
	 * V2, v3
	 * @todo The spec contradicts taking a string here, but the property description and web validator claims it's valid.
	 */
	targetProduct?: Array<SoftwareApplication | Text> | SoftwareApplication | Text
	/**
	 * URL of the item.
	 * V2, v3
	 */
	url?: URL | URL[]
	/**
	 * The version of the CreativeWork embodied by a specified resource.
	 * V2, v3
	 */
	version?: Array<Number | Text> | Number | Text
}

/**
 * JSON-LD boilerplate properties for code meta
 */
type CodeMetaBoilerplate = {
	/** JSON-LD context */
	'@context':
		| 'https://raw.githubusercontent.com/jantman/repostatus.org/master/badges/latest/ontology.jsonld'
		| 'https://schema.org'
		| 'https://w3id.org/codemeta/3.0'
		| 'https://w3id.org/codemeta/3.1'
		| 'https://w3id.org/software-iodata'
		| 'https://w3id.org/software-type'
		| Array<
				| 'https://raw.githubusercontent.com/jantman/repostatus.org/master/badges/latest/ontology.jsonld'
				| 'https://schema.org'
				| 'https://w3id.org/codemeta/3.0'
				| 'https://w3id.org/codemeta/3.1'
				| 'https://w3id.org/software-iodata'
				| 'https://w3id.org/software-type'
				| Record<string, unknown>
				| (string & {})
		  >
		| Record<string, unknown>
		| (string & {})
	/** JSON-LD identifier */
	'@id'?: string
	/** JSON-LD type */
	'@type'?: Type
	/**
	 * JSON-LD identifier (convenience alias for \@id)
	 */
	id?: string
	/**
	 * JSON-LD type (convenience alias for \@type)
	 */
	type?: Type
}

/**
 * A CodeMeta JSON-LD document describing a software project.
 *
 * Combines JSON-LD boilerplate (`@context`, `@type`, `@id`), CodeMeta-specific
 * terms (e.g. `developmentStatus`, `issueTracker`), and schema.org software
 * properties (e.g. `author`, `license`, `softwareRequirements`). Allows
 * arbitrary additional properties via the index signature.
 * @see [CodeMeta v3.1 specification](https://w3id.org/codemeta/3.1)
 * @see [CodeMeta terms reference](https://codemeta.github.io/terms/)
 * @see [CodeMeta JSON-LD Spec](https://raw.githubusercontent.com/codemeta/codemeta/3.1/codemeta.jsonld)
 */
export type CodeMeta = Simplify<
	CodeMetaBoilerplate & CodeMetaTerms & Record<string, unknown> & SchemaOrgSoftwareTerms
>
