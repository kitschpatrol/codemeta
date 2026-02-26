#!/usr/bin/env node

import { writeFileSync } from 'node:fs'
import { createLogger } from 'lognow'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { bin, version } from '../../package.json' with { type: 'json' }
import { generate, setLogger, validate } from '../lib/index.js'
import { log } from '../lib/log.js'

const cliCommandName = Object.keys(bin).at(0)!
const yargsInstance = yargs(hideBin(process.argv))

const argv = await yargsInstance
	.scriptName(cliCommandName)
	.usage(
		'$0 [paths..]',
		'Discover and parse software metadata from files and directories into CodeMeta JSON-LD.',
	)
	.positional('paths', {
		default: ['.'],
		describe: 'Paths to files or directories to scan for metadata.',
		type: 'string',
	})
	.option('verbose', {
		alias: 'V',
		description: 'Enable verbose logging',
		type: 'boolean',
	})
	.option('output', {
		alias: 'o',
		description: 'Write output to file',
		type: 'string',
	})
	.option('enrich', {
		default: false,
		description: 'Enable automatic inference and enrichment',
		type: 'boolean',
	})
	.option('validate', {
		default: false,
		description: 'Validate and report on metadata quality',
		type: 'boolean',
	})
	.option('exclude', {
		description: 'Filenames or globs to exclude from automatic discovery in directories',
		string: true,
		type: 'array',
	})
	.option('retain', {
		default: false,
		description:
			'Retain existing codemeta.json as input alongside primary metadata sources. Without this flag, an existing codemeta.json is only used when no primary sources (package.json, Cargo.toml,etc.) are found.',
		type: 'boolean',
	})
	.option('recursive', {
		alias: 'r',
		default: false,
		description: 'Scan subdirectories for metadata',
		type: 'boolean',
	})
	.option('set', {
		alias: 's',
		description: 'Override a property (e.g. --set name="My Project")',
		string: true,
		type: 'array',
	})
	.option('base-uri', {
		description: 'Base URI for identifiers',
		type: 'string',
	})
	.middleware((argv) => {
		setLogger(
			createLogger({
				name: 'codemeta',
				logToConsole: {
					showTime: false,
				},
				verbose: argv.verbose,
			}),
		)
	})
	.alias('h', 'help')
	.version(version)
	.alias('v', 'version')
	.help()
	.strictOptions()
	.wrap(process.stdout.isTTY ? Math.min(120, yargsInstance.terminalWidth()) : 0)
	.parse()

try {
	// Parse --set overrides
	const overrides: Record<string, unknown> = {}
	if (argv.set) {
		for (const setting of argv.set) {
			const equalsIndex = setting.indexOf('=')
			if (equalsIndex > 0) {
				const key = setting.slice(0, equalsIndex)
				let value: unknown = setting.slice(equalsIndex + 1)
				// Try parsing as JSON for complex values
				try {
					value = JSON.parse(value as string)
				} catch {
					// Keep as string
				}

				overrides[key] = value
			}
		}
	}

	const meta = await generate((argv.paths as string[]) || ['.'], {
		baseUri: argv.baseUri,
		enrich: argv.enrich,
		exclude: argv.exclude as string[] | undefined,
		retain: argv.retain,
		overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
		recursive: argv.recursive,
	})

	if (argv.validate) {
		const result = validate(meta)
		for (const warning of result.warnings) {
			log[warning.severity](`${warning.property}: ${warning.message}`)
		}

		if (!result.valid) {
			log.error('Validation failed')
			process.exitCode = 1
		} else if (result.warnings.length === 0) {
			log.info('Validation passed with no warnings.')
		} else {
			log.warn(`Validation passed with ${result.warnings.length} warning(s)`)
		}
	}

	const output = JSON.stringify(meta, undefined, 2)

	if (argv.output) {
		writeFileSync(argv.output, output + '\n', 'utf8')
		log.info(`Metadata written to ${argv.output}\n`)
	} else {
		process.stdout.write(output + '\n')
	}
} catch (error) {
	log.error(`${error instanceof Error ? error.message : String(error)}`)
	process.exitCode = 1
}
