import { defineConfig } from 'tsdown'

export default defineConfig([
	// CLI
	{
		dts: false,
		entry: 'src/bin/cli.ts',
		fixedExtension: false,
		inlineOnly: false,
		inputOptions: {
			checks: {
				// In web-tree-sitter...
				eval: false,
			},
		},
		minify: true,
		noExternal: /.*/,
		outDir: 'dist/bin',
	},
	// Library
	{
		attw: {
			profile: 'esm-only',
		},
		copy: [
			{
				from: [
					'node_modules/tree-sitter-ruby/tree-sitter-ruby.wasm',
					'node_modules/tree-sitter-python/tree-sitter-python.wasm',
				],
				to: 'dist/grammars',
			},
			{
				from: 'node_modules/tree-sitter-ruby/LICENSE',
				rename: 'tree-sitter-ruby-LICENSE',
				to: 'dist/grammars',
			},
			{
				from: 'node_modules/tree-sitter-python/LICENSE',
				rename: 'tree-sitter-python-LICENSE',
				to: 'dist/grammars',
			},
		],
		entry: 'src/lib/index.ts',
		fixedExtension: false,
		outDir: 'dist/lib',
		publint: true,
		tsconfig: 'tsconfig.build.json',
	},
])
