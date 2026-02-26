/**
 * Shared WASM loader for web-tree-sitter.
 * Provides singleton initialization and cached language loading.
 */

import { createRequire } from 'node:module'
import { Language, Parser } from 'web-tree-sitter'

let initialized = false

/** Initialize web-tree-sitter (idempotent) and return a new Parser instance. */
export async function initParser(): Promise<Parser> {
	if (!initialized) {
		await Parser.init()
		initialized = true
	}
	return new Parser()
}

/** Load a WASM language grammar from a tree-sitter-* package. */
async function loadLanguage(packageName: string, wasmFile: string): Promise<Language> {
	const require = createRequire(import.meta.url)
	const wasmPath = require.resolve(`${packageName}/${wasmFile}`)
	return Language.load(wasmPath)
}

let rubyLanguage: Language | undefined
/** Get the Ruby language (cached after first load). */
export async function getRubyLanguage(): Promise<Language> {
	rubyLanguage ??= await loadLanguage('tree-sitter-ruby', 'tree-sitter-ruby.wasm')
	return rubyLanguage
}

let pythonLanguage: Language | undefined
/** Get the Python language (cached after first load). */
export async function getPythonLanguage(): Promise<Language> {
	pythonLanguage ??= await loadLanguage('tree-sitter-python', 'tree-sitter-python.wasm')
	return pythonLanguage
}
