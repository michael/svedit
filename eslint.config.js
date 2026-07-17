import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				svelteConfig,
				// Parses <script lang="ts"> blocks
				parser: typescriptParser
			}
		},
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	// TypeScript configuration for .ts files
	{
		files: ['**/*.ts', '**/*.svelte.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				project: './tsconfig.json',
				ecmaVersion: 2022,
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
			// The TypeScript compiler already checks undefined identifiers (and
			// knows Svelte runes in .svelte.ts files); the base rule does not.
			'no-undef': 'off',
			// Disable the base rule in favor of the TS-aware variant
			// (the base rule misreports mapped type parameters and type-only usage)
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/prefer-namespace-keyword': 'error',
			'@typescript-eslint/triple-slash-reference': 'error',
			'@typescript-eslint/no-unsafe-function-type': 'error',
			'@typescript-eslint/no-wrapper-object-types': 'error',
			'@typescript-eslint/no-duplicate-enum-values': 'error',
			'@typescript-eslint/no-empty-object-type': 'error',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-misused-new': 'error',
			'@typescript-eslint/no-namespace': 'error',
			'@typescript-eslint/no-this-alias': 'error'
		}
	},
	{
		files: ['src/test/**', 'src/routes/perftest/**'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
];
