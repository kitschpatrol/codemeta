import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'tinyglobby'
import { generate } from '../src/lib/index.js'

const fixtureFiles = await glob('./test/fixtures/**', {
	absolute: true,
	onlyFiles: true,
})

function replaceExtension(filePath: string, newExtension: string): string {
	const extension = path.extname(filePath)
	return (
		filePath.slice(0, -extension.length) +
		(newExtension.startsWith('.') ? newExtension : `.${newExtension}`)
	)
}

async function processAndSave(filePath: string): Promise<void> {
	try {
		const result = await generate(filePath)
		const destinationFile = replaceExtension(
			filePath.replace('/fixtures/', '/fixtures-processed/'),
			'.json',
		)

		const destinationDirectory = path.dirname(destinationFile)
		await fs.mkdir(destinationDirectory, { recursive: true })
		await fs.writeFile(destinationFile, JSON.stringify(result, undefined, 2), 'utf8')
	} catch {
		console.log(`Failed to process ${filePath}`)
	}
}

await Promise.allSettled(fixtureFiles.map(async (filePath) => processAndSave(filePath)))

const processedFixtureFiles = await glob('./test/fixtures-processed/**', {
	absolute: true,
	onlyFiles: true,
})

console.log(`Processed ${processedFixtureFiles.length} out of ${fixtureFiles.length}`)
