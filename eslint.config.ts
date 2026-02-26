import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		ignores: ['test/fixtures/*', '.claude/*'],
		ts: {
			overrides: {
				// Allow Null
				'ts/no-restricted-types': [
					'error',
					{
						types: {
							'[[[[[]]]]]': "Don't use `[[[[[]]]]]`. Use `SomeType[][][][][]` instead.",
							'[[[[]]]]': "Don't use `[[[[]]]]`. Use `SomeType[][][][]` instead.",
							'[[[]]]': "Don't use `[[[]]]`. Use `SomeType[][][]` instead.",
							'[[]]':
								"Don't use `[[]]`. It only allows an array with a single element which is an empty array. Use `SomeType[][]` instead.",
							'[]': "Don't use the empty array type `[]`. It only allows empty arrays. Use `SomeType[]` instead.",
							// eslint-disable-next-line ts/naming-convention
							Buffer: {
								message:
									'Use Uint8Array instead. See: https://sindresorhus.com/blog/goodbye-nodejs-buffer',
								suggest: ['Uint8Array'],
							},
							object: {
								message:
									'The `object` type is hard to use. Use `Record<string, unknown>` instead. See: https://github.com/typescript-eslint/typescript-eslint/pull/848',
								suggest: ['Record<string, unknown>'],
							},
						},
					},
				],
				'unicorn/no-null': 'off',
			},
		},
		type: 'lib',
	},
	// Parser and serialization code works with untyped data from JSON/TOML/XML.
	// Type assertions are the standard TypeScript pattern for this use case.
	{
		files: [
			'src/lib/parsers/**/*.ts',
			'src/lib/serialize.ts',
			'src/lib/merge.ts',
			'src/lib/person.ts',
			'src/lib/graph.ts',
		],
		rules: {
			complexity: 'off',
			'max-depth': 'off',
			'ts/no-unsafe-assignment': 'off',
			'ts/no-unsafe-member-access': 'off',
			'ts/no-unsafe-return': 'off',
			'ts/no-unsafe-type-assertion': 'off',
			'ts/require-await': 'off',
		},
	},
	// Maven POM files use ${variable} template syntax in string literals
	{
		files: ['src/lib/parsers/java.ts'],
		rules: {
			'no-template-curly-in-string': 'off',
		},
	},
	// Readme imports
	{
		files: ['readme.md/**/*.ts'],
		rules: {
			'import/no-unresolved': ['error', { ignore: ['@kitschpatrol*'] }],
		},
	},
)
