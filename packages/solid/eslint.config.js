import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import solid from 'eslint-plugin-solid/configs/typescript';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';
import { fileURLToPath } from 'node:url';

const gitignorePath = fileURLToPath(new URL('../../.gitignore', import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	// TypeScript and Solid configuration for .ts/.tsx files
	{
		files: ['**/*.ts', '**/*.tsx'],
		...solid,
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				project: './tsconfig.json',
				ecmaVersion: 2022,
				sourceType: 'module',
				ecmaFeatures: { jsx: true }
			}
		},
		plugins: {
			...solid.plugins,
			'@typescript-eslint': typescript
		},
		rules: {
			...solid.rules,
			// Inline styles are CSS strings on purpose: they carry custom
			// properties and anchor names (`anchor-name: --path`) that consumer
			// styles are appended to.
			'solid/style-prop': 'off',
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
