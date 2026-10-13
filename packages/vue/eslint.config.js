import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';
import { fileURLToPath } from 'node:url';

const gitignorePath = fileURLToPath(new URL('../../.gitignore', import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...vue.configs['flat/recommended'],
	prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.vue'],
		languageOptions: {
			parser: vueParser,
			parserOptions: {
				// Parses <script lang="ts"> blocks
				parser: typescriptParser,
				extraFileExtensions: ['.vue'],
				ecmaVersion: 2022,
				sourceType: 'module'
			}
		},
		plugins: {
			// Registered for .vue files too, so the syntax-only rules (and the
			// eslint-disable comments naming them) resolve inside <script lang="ts">.
			'@typescript-eslint': typescript
		},
		rules: {
			// The TypeScript compiler already checks undefined identifiers; the base rule does not.
			'no-undef': 'off',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-explicit-any': 'warn',
			// Component names are snake_case node types in some test fixtures and the
			// demo deliberately uses single-word names such as Page, Story and Link.
			'vue/multi-word-component-names': 'off',
			// snake_case identifiers are the project convention, props included
			// (`array_path`, `focus_canvas`, ...).
			'vue/prop-name-casing': 'off',
			// The `session` prop is a class instance whose fields (`selection`, ...)
			// are meant to be written by components; only reassigning a prop itself
			// is a mistake.
			'vue/no-mutating-props': ['error', { shallowOnly: true }],
			// Templates inside the editable canvas are whitespace sensitive and
			// intentionally dense; let prettier own formatting.
			'vue/max-attributes-per-line': 'off',
			'vue/singleline-html-element-content-newline': 'off',
			'vue/multiline-html-element-content-newline': 'off',
			'vue/html-indent': 'off',
			'vue/html-self-closing': 'off',
			'vue/attributes-order': 'off',
			'vue/require-default-prop': 'off',
			'vue/no-v-html': 'off',
			'vue/one-component-per-file': 'off'
		}
	},
	// TypeScript configuration for .ts files
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				project: './tsconfig.json',
				extraFileExtensions: ['.vue'],
				ecmaVersion: 2022,
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
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
