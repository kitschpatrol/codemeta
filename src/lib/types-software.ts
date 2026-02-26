/**
 * TypeScript type definitions for the Software Types schema.org profile v1.0.0.
 * @see https://softwareunderstanding.github.io/software_types/release/1.0.0/
 * @see https://w3id.org/software-types
 *
 * This profile extends schema.org's SoftwareApplication with additional
 * subtypes for describing software based on interface type. It is designed
 * for use with codemeta and schema.org metadata descriptions.
 *
 * Existing schema.org types available via `schema-dts` (not redefined here):
 *   - schema:SoftwareApplication
 *   - schema:WebApplication
 *   - schema:MobileApplication
 *   - schema:VideoGame
 *   - schema:WebAPI
 *   - schema:SoftwareSourceCode
 */

import type { SoftwareApplication, Text } from 'schema-dts'

// Re-export schema.org types that are part of the software types ecosystem

// ---------------------------------------------------------------------------
// Base properties shared by all software-types classes
// ---------------------------------------------------------------------------

/**
 * Properties from `schema:SoftwareApplication` that can appear on any
 * software types class. Extracted from the exported `SoftwareApplication`
 * union by stripping the discriminant `@type`.
 *
 * This effectively gives you `applicationCategory`, `operatingSystem`,
 * `softwareVersion`, `downloadUrl`, `name`, `url`, etc.
 */
type SoftwareApplicationProperties = Omit<
	Extract<SoftwareApplication, { '@type': 'SoftwareApplication' }>,
	'@type'
>

/**
 * Additional properties introduced by the software types profile that can
 * appear on any SoftwareApplication subtype.
 */
type SoftwareTypesProperties = {
	/**
	 * The base filename of the executable for the software application.
	 *
	 * It should not be a full path, nor should it contain any command-line
	 * parameters. It is recommended to either leave out platform-specific
	 * extensions like `.exe` if the executable differs across platforms, or to
	 * use the property multiple times to list all possible variants.
	 * @see https://w3id.org/software-types#executableName
	 * @example "grep"
	 * @example "Widoco-1.14.17-jar-with-dependencies.jar"
	 */
	executableName?: Text | Text[]
}

// ---------------------------------------------------------------------------
// New classes (all rdfs:subClassOf schema:SoftwareApplication)
// ---------------------------------------------------------------------------

/**
 * A software application offering a command-line interface as the primary
 * means of interaction.
 * @example grep, sed, git
 * @see https://w3id.org/software-types#CommandLineApplication
 */
export type CommandLineApplication = SoftwareApplicationProperties &
	SoftwareTypesProperties & {
		'@type': 'CommandLineApplication'
	}

/**
 * A software application offering a desktop graphical user interface as
 * the primary means of interaction.
 * @example Firefox, Microsoft Word, FaceTime
 * @see https://w3id.org/software-types#DesktopApplication
 */
export type DesktopApplication = SoftwareApplicationProperties &
	SoftwareTypesProperties & {
		'@type': 'DesktopApplication'
	}

/**
 * A software application offering an Application Programming Interface
 * (API) for developers.
 * @example openssl, libxml2, blas, Huggingface transformers, python-requests
 * @see https://w3id.org/software-types#SoftwareLibrary
 */
export type SoftwareLibrary = SoftwareApplicationProperties &
	SoftwareTypesProperties & {
		'@type': 'SoftwareLibrary'
	}

/**
 * A web application in the form of a notebook (e.g. Jupyter Notebook,
 * R Notebook) or data story.
 * @see https://w3id.org/software-types#NotebookApplication
 */
// export type NotebookApplication = SoftwareApplicationProperties &
// 	SoftwareTypesProperties & {
// 		'@type': 'NotebookApplication'
// 	}

/**
 * A software application running as a daemon providing a service, either
 * locally or over a network, running in the background.
 * @example nginx, MySQL, postfix
 * @see https://w3id.org/software-types#ServerApplication
 */
// export type ServerApplication = SoftwareApplicationProperties &
// 	SoftwareTypesProperties & {
// 		'@type': 'ServerApplication'
// 	}

/**
 * A software application in the form of an image (such as a container
 * image or virtual machine image) that distributes the application along
 * with its wider dependency context.
 * @see https://w3id.org/software-types#SoftwareImage
 */
// export type SoftwareImage = SoftwareApplicationProperties &
// 	SoftwareTypesProperties & {
// 		'@type': 'SoftwareImage'
// 	}

/**
 * A software application in the form of a package for any particular
 * package manager. It distributes the application but not necessarily its
 * wider dependency context.
 * @see https://w3id.org/software-types#SoftwarePackage
 */
// export type SoftwarePackage = SoftwareApplicationProperties &
// 	SoftwareTypesProperties & {
// 		'@type': 'SoftwarePackage'
// 	}

/**
 * A software application offering an interactive terminal text-based user
 * interface as the primary means of interaction.
 * @example vim, mutt, htop, tmux, ncmpcpp, mc
 * @see https://w3id.org/software-types#TerminalApplication
 */
// export type TerminalApplication = SoftwareApplicationProperties &
// 	SoftwareTypesProperties & {
// 		'@type': 'TerminalApplication'
// 	}
