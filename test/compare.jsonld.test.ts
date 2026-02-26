import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateFromFiles } from '../src/lib/generate.js'
import {
	codemetapyAvailable,
	compareCanonical,
	compareJson,
	formatCanonicalDiff,
	formatJsonDiff,
	isCanonicalMatch,
	isJsonMatch,
	runCodemetapy,
} from './compare-helper.js'

const fixtureDirectory = resolve(import.meta.dirname, 'fixtures/codemeta')
const fixtures = readdirSync(fixtureDirectory).filter((f) => f.endsWith('.json'))

// Fixtures with known issues in our parser or codemetapy
const KNOWN_BROKEN = new Set<string>([
	// Uses "codemeta:" as both a prefix and what looks like an IRI scheme —
	// Empty @id values ("@id": "") cause null termType crash in RDF pipeline
	'chloroextractorteam-chloroextractor.codemeta.json',
	// Unknown
	'digital-porous-media-geometric-characterization.codemeta.json',
	// Codemetapy times out on these complex fixtures (>15s)
	'kit-data-manager-react-search-component.codemeta.json',
	'languagemachines-frog-2.codemeta.json',
	'languagemachines-frog.codemeta.json',
	'materials-data-science-and-informatics-fair-python-cookiecutter.codemeta.json',
	'ornl-ndav-django-remote-submission.codemeta.json',
	'proycon-codemetapy.codemeta.json',
	'proycon-labirinto-harvest.codemeta.json',
	// References non-cached external context (gitlab.ebrains.eu servicemeta)
	'the-virtual-brain-tvb-root.codemeta.json',
	// Codemeta v1 context — property IRIs don't match v3 framing context
	// (e.g. "suggests"→softwareSuggestions, "requirements"→softwareRequirements)
	'v1-all-fields.codemeta.json',
	'v1-example-2.codemeta.json',
	'v1-example.codemeta.json',
	'v3-all-fields.codemeta.json',
	// Null termType crash (malformed @id)
	'v-bhelande-ts-repo.codemeta.json',
])

const healthy = fixtures.filter((f) => !KNOWN_BROKEN.has(f))

describe('JSON-LD — codemetapy parity', { timeout: 30_000 }, async () => {
	const available = await codemetapyAvailable()

	describe('canonical (RDF)', () => {
		it.skipIf(!available).each(healthy)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const ours = (await generateFromFiles([filePath])) as Record<string, unknown>

			const theirs = await runCodemetapy(filePath)
			if (!theirs) return

			const diff = await compareCanonical(ours, theirs)
			expect(isCanonicalMatch(diff), `Differences:\n${formatCanonicalDiff(diff)}`).toBe(true)
		})
	})

	describe('JSON', () => {
		it.skipIf(!available).each(healthy)('%s', async (file) => {
			const filePath = resolve(fixtureDirectory, file)
			const ours = (await generateFromFiles([filePath])) as Record<string, unknown>

			const theirs = await runCodemetapy(filePath)
			if (!theirs) return

			const diff = compareJson(ours, theirs)
			expect(isJsonMatch(diff), `Differences:\n${formatJsonDiff(diff)}`).toBe(true)
		})
	})
})
