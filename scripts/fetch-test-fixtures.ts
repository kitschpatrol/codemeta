/* eslint-disable ts/naming-convention */
/* eslint-disable ts/no-unused-vars */

import { XMLParser } from 'fast-xml-parser'
import fs from 'node:fs/promises'
import path from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parse as parseToml } from 'smol-toml'
import { parseDocument as parseYaml } from 'yaml'
import { execFileAsync } from './utilities'

type GitHubSearchResult = {
	path: string
	repository: {
		nameWithOwner: string
	}
	url: string
}

async function getFileSearchResults(
	name: string,
	fuzzySearch = false,
): Promise<GitHubSearchResult[]> {
	const { stdout } = await execFileAsync('gh', [
		'search',
		'code',
		'--filename',
		name,
		'--limit',
		'50',
		'--json',
		'url,repository,path',
	])

	// eslint-disable-next-line ts/no-unsafe-type-assertion
	let results = JSON.parse(stdout) as GitHubSearchResult[]

	if (!fuzzySearch) {
		results = results.filter((result) => path.basename(result.path) === name)
	}

	return results
}

async function saveFileSearchResult(
	result: GitHubSearchResult,
	destinationDirectory: string,
	validate?: (filename: string, content: string) => boolean,
): Promise<void> {
	const rawUrl = result.url
		.replace('https://github.com/', 'https://raw.githubusercontent.com/')
		.replace('/blob/', '/')

	const response = await fetch(rawUrl)
	const content = await response.text()

	const basename = path.basename(result.path)

	const isValid = validate === undefined ? true : validate(basename, content)

	if (!isValid) {
		console.log(`Skipping invalid file: ${rawUrl}`)
		return
	}

	const prefix = result.repository.nameWithOwner.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')

	const filename = `${prefix}.${basename}`

	await fs.mkdir(destinationDirectory, { recursive: true })
	await fs.writeFile(path.resolve(destinationDirectory, filename), content, {
		flag: 'w',
	})
}

// @ts-expect-error - Use is commented out
async function saveAllFileSearchResults(
	search: string,
	destination: string,
	fuzzySearch = false,
	validate?: (filename: string, content: string) => boolean,
): Promise<void> {
	const results = await getFileSearchResults(search, fuzzySearch)
	console.log(results)
	const promises = results.map(async (result) =>
		saveFileSearchResult(result, destination, validate),
	)
	await Promise.all(promises)
}

// @ts-expect-error - Use is commented out
function isValidJson(_filename: string, content: string): boolean {
	try {
		JSON.parse(content)
		return true
	} catch {
		return false
	}
}

// @ts-expect-error - Use is commented out
function isValidToml(_filename: string, content: string): boolean {
	try {
		parseToml(content)
		return true
	} catch {
		return false
	}
}

// @ts-expect-error - Use is commented out
function isValidXml(_filename: string, content: string): boolean {
	try {
		new XMLParser().parse(content)
		return true
	} catch {
		return false
	}
}

// @ts-expect-error - Use is commented out
function isValidYaml(_filename: string, content: string): boolean {
	const doc = parseYaml(content)
	return doc.errors.length === 0 && doc.contents !== null
}

// @ts-expect-error - Use is commented out
function isValidLicenseFile(filename: string, _content: string): boolean {
	const normalized = filename.trim().toLowerCase()
	const base = path.basename(normalized)
	const extension = path.extname(base)

	const exactNames = new Set(['copying', 'licence', 'license', 'unlicense'])

	if (exactNames.has(base)) {
		return true
	}

	if (
		(extension === '.md' || extension === '.txt') &&
		exactNames.has(base.slice(0, -extension.length))
	) {
		return true
	}

	return false
}

async function run() {
	const rl = createInterface({ input, output })

	try {
		const answer = await rl.question(
			'Are you sure you want to download and overwrite the test fixtures? (y/n): ',
		)

		rl.close()

		if (answer.toLowerCase() !== 'y') {
			console.log('Aborting...')
			return // Exit the function
		}

		console.log('Proceeding with fetch...')
		// Too sloppy to be useful
		// await saveAllFileSearchResults('AUTHORS', './test/fixtures/authors', true)
		// await saveAllFileSearchResults('CONTRIBUTORS', './test/fixtures/contributors', true)
		// await saveAllFileSearchResults('MAINTAINERS', './test/fixtures/maintainers', true)

		// await saveAllFileSearchResults('codemeta.json', './test/fixtures/codemeta', false, isValidJson)
		// await saveAllFileSearchResults('package.json', './test/fixtures/package', false, isValidJson)
		// await saveAllFileSearchResults('pyproject.toml', './test/fixtures/python', false, isValidToml)
		// await saveAllFileSearchResults('Cargo.toml', './test/fixtures/cargo', false, isValidToml)
		// await saveAllFileSearchResults('pom.xml', './test/fixtures/pom', false, isValidXml)
		// await saveAllFileSearchResults(
		// 	'publiccode.yml',
		// 	'./test/fixtures/publiccode',
		// 	false,
		// 	isValidXml,
		// )
		// await saveAllFileSearchResults(
		// 	'publiccode.yml',
		// 	'./test/fixtures/publiccode',
		// 	false,
		// 	isValidYaml,
		// )
		// await saveAllFileSearchResults(
		// 	'publiccode.yaml',
		// 	'./test/fixtures/publiccode',
		// 	false,
		// 	isValidYaml,
		// )
		// await saveAllFileSearchResults('.gemspec', './test/fixtures/gemspec', true)
		// await saveAllFileSearchResults('PKG-INFO', './test/fixtures/pkg-info', false)
		// await saveAllFileSearchResults('setup.cfg', './test/fixtures/setup-cfg', false)
		// await saveAllFileSearchResults('setup.py', './test/fixtures/setup-py', false)
		// await saveAllFileSearchResults('go.mod', './test/fixtures/go-mod', false)
		// await saveAllFileSearchResults(
		// 	'.goreleaser.yaml',
		// 	'./test/fixtures/goreleaser',
		// 	false,
		// 	isValidYaml,
		// )
		// await saveAllFileSearchResults(
		// 	'.goreleaser.yml',
		// 	'./test/fixtures/goreleaser',
		// 	false,
		// 	isValidYaml,
		// )
		// await saveAllFileSearchResults('license', './test/fixtures/license', false, isValidLicenseFile)
		// await saveAllFileSearchResults('licence', './test/fixtures/licence', false, isValidLicenseFile)
		// await saveAllFileSearchResults('copying', './test/fixtures/copying', false, isValidLicenseFile)
		// await saveAllFileSearchResults(
		// 	'unlicense',
		// 	'./test/fixtures/unlicense',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'license.md',
		// 	'./test/fixtures/license',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'licence.md',
		// 	'./test/fixtures/licence',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'copying.md',
		// 	'./test/fixtures/copying',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'unlicense.md',
		// 	'./test/fixtures/unlicense',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'license.txt',
		// 	'./test/fixtures/license',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'licence.txt',
		// 	'./test/fixtures/licence',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'copying.txt',
		// 	'./test/fixtures/copying',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults(
		// 	'unlicense.txt',
		// 	'./test/fixtures/unlicense',
		// 	false,
		// 	isValidLicenseFile,
		// )
		// await saveAllFileSearchResults('readme.md', './test/fixtures/readme', false)
	} catch (error) {
		console.error('Error during prompt:', error)
		rl.close()
	}
}

// Execute
await run()
