/**
 * Guards the component styles that are intentionally duplicated across the
 * four bindings against drifting apart.
 *
 * Each binding keeps its component styles in its own idiom (Svelte and Vue
 * inline in the component, React and Solid in a colocated .css file), so a
 * copied component stays self-contained. This script makes sure a fix
 * applied to one copy is applied to all four:
 *
 * - Svelte and Vue must have the same rules: matched by selector (after
 *   unwrapping `:global(...)` and `:deep(...)`) and at-rule context, with
 *   identical declarations.
 * - React and Solid must each have a rule with the same at-rule context and
 *   declarations for every Svelte rule, and no others. Their selectors are
 *   not compared: without scoped styles the React and Solid ports qualify
 *   them by hand
 *   (e.g. `[data-type='property'] > .property-selectable`). The same applies
 *   to rules in Vue's unscoped `<style>` blocks, which Vue uses where scoping
 *   would raise specificity (e.g. the zero-specificity `:where()` base rule).
 * - styles/svedit-animations.css must be identical, and
 *   styles/svedit-colors.css must define the same variables (each binding
 *   picks its own brand values).
 *
 * Comments and formatting are ignored, nested rules (`&::before { ... }`)
 * are flattened, and all <style> blocks of a component are read. Rules are
 * matched by content, not position, so a pure reordering of rules is not
 * detected.
 *
 *   node scripts/check_style_drift.mjs     (also part of `pnpm lint`)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lib = (pkg) => join(root, 'packages', pkg, 'src', 'lib');

/**
 * Returns the contents of the <style> blocks of a .svelte/.vue file, split
 * into scoped and unscoped blocks. Svelte styles count as scoped (they use
 * `:global(...)` where needed); in Vue only `<style scoped>` does.
 */
function style_blocks(file, framework) {
	const source = readFileSync(file, 'utf8');
	const blocks = { scoped: '', unscoped: '' };
	for (const match of source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
		const scoped = framework === 'svelte' || /\bscoped\b/.test(match[1]);
		blocks[scoped ? 'scoped' : 'unscoped'] += match[2] + '\n';
	}
	return blocks;
}

/** Unwraps `:global(x)` and `:deep(x)` (balanced parentheses) to `x`. */
function unwrap_scoping(selector) {
	let result = selector;
	for (const fn of [':global(', ':deep(']) {
		let index;
		while ((index = result.indexOf(fn)) !== -1) {
			let depth = 1;
			let end = index + fn.length;
			while (end < result.length && depth > 0) {
				if (result[end] === '(') depth++;
				else if (result[end] === ')') depth--;
				end++;
			}
			result =
				result.slice(0, index) + result.slice(index + fn.length, end - 1) + result.slice(end);
		}
	}
	return result;
}

function normalize(text) {
	return text
		.replace(/\s+/g, ' ')
		.replace(/\(\s+/g, '(')
		.replace(/\s+\)/g, ')')
		.replace(/"/g, "'")
		.trim();
}

function normalize_selector(selector) {
	return normalize(unwrap_scoping(selector))
		.split(',')
		.map((part) => part.trim())
		.join(', ');
}

/** Resolves a nested selector against its parent (`&` or descendant). */
function nest(parent, child) {
	if (!parent) return child;
	const parents = parent.split(',').map((part) => part.trim());
	return child
		.split(',')
		.map((part) => part.trim())
		.flatMap((part) =>
			parents.map((p) => (part.includes('&') ? part.replaceAll('&', p) : `${p} ${part}`))
		)
		.join(', ');
}

/**
 * Parses CSS into a flat list of rules:
 * { context: '@media ... > @supports ...', selector, declarations: [] }.
 * Handles comments, at-rule blocks, nested rules and declarations; enough
 * for the component stylesheets, not a general CSS parser.
 */
function parse(css) {
	const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const rules = [];
	let i = 0;

	function parse_block(context, selector) {
		const declarations = [];
		const own = { context, selector, declarations };
		if (selector !== null) rules.push(own);
		let buffer = '';
		while (i < source.length) {
			const char = source[i];
			if (char === '{') {
				i++;
				const prelude = normalize(buffer);
				buffer = '';
				if (prelude.startsWith('@')) {
					// keyframes and other at-rules: keep the chain as context
					const next_context = context ? `${context} > ${prelude}` : prelude;
					parse_block(next_context, prelude.startsWith('@keyframes') ? '' : selector);
				} else {
					parse_block(context, nest(selector, prelude));
				}
			} else if (char === '}') {
				i++;
				const rest = normalize(buffer);
				if (rest) declarations.push(rest);
				return;
			} else if (char === ';') {
				i++;
				const declaration = normalize(buffer);
				if (declaration) declarations.push(declaration);
				buffer = '';
			} else {
				buffer += char;
				i++;
			}
		}
		const rest = normalize(buffer);
		if (rest) declarations.push(rest);
	}

	parse_block('', null);
	return rules.filter((rule) => rule.declarations.length > 0);
}

const problems = [];

function compare_component(name) {
	const vue_blocks = style_blocks(join(lib('vue'), `${name}.vue`), 'vue');
	const parsed = {
		svelte: parse(style_blocks(join(lib('svelte'), `${name}.svelte`), 'svelte').scoped),
		vue: parse(vue_blocks.scoped),
		vue_unscoped: parse(vue_blocks.unscoped),
		react: parse(readFileSync(join(lib('react'), `${name}.css`), 'utf8')),
		solid: parse(readFileSync(join(lib('solid'), `${name}.css`), 'utf8'))
	};
	const where = (rule) => (rule.context ? ` (in ${rule.context})` : '');
	const body = (rule) => rule.declarations.join('; ');

	// Svelte and Vue: same selectors, same declarations
	const by_selector = (rules) => {
		const map = new Map();
		for (const rule of rules) {
			const key = `${rule.context}|${normalize_selector(rule.selector)}`;
			map.set(key, [...(map.get(key) ?? []), rule]);
		}
		return map;
	};
	const svelte_rules = by_selector(parsed.svelte);
	const vue_rules = by_selector(parsed.vue);
	const vue_unscoped_blocks = parsed.vue_unscoped.map((rule) => `${rule.context}|${body(rule)}`);
	for (const [key, rules] of svelte_rules) {
		const others = vue_rules.get(key);
		const selector = normalize_selector(rules[0].selector) + where(rules[0]);
		if (!others) {
			// Vue may hold it in an unscoped block with a hand-qualified selector
			const unmatched = rules.filter((rule) => {
				const index = vue_unscoped_blocks.indexOf(`${rule.context}|${body(rule)}`);
				if (index === -1) return true;
				vue_unscoped_blocks.splice(index, 1);
				return false;
			});
			if (unmatched.length > 0) {
				problems.push(
					`${name}: no vue rule matches svelte \`${selector}\`\n    svelte: ${unmatched.map(body).join(' | ')}`
				);
			}
		} else if (rules.map(body).join(' | ') !== others.map(body).join(' | ')) {
			problems.push(
				`${name}: \`${selector}\` declarations differ\n    svelte: ${rules.map(body).join(' | ')}\n    vue:    ${others.map(body).join(' | ')}`
			);
		}
	}
	for (const [key, rules] of vue_rules) {
		if (!svelte_rules.has(key)) {
			problems.push(
				`${name}: rule \`${normalize_selector(rules[0].selector)}${where(rules[0])}\` exists only in vue`
			);
		}
	}
	for (const block of vue_unscoped_blocks) {
		const [context, declarations] = block.split('|');
		problems.push(
			`${name}: vue has an unscoped rule no svelte rule matches${context ? ` (in ${context})` : ''}\n    vue: ${declarations}`
		);
	}

	// React and Solid: same declaration blocks (selectors are qualified differently)
	const blocks = (rules) => rules.map((rule) => `${rule.context}|${body(rule)}`);
	for (const pkg of ['react', 'solid']) {
		const pkg_blocks = blocks(parsed[pkg]);
		for (const rule of parsed.svelte) {
			const block = `${rule.context}|${body(rule)}`;
			const index = pkg_blocks.indexOf(block);
			if (index === -1) {
				problems.push(
					`${name}: no ${pkg} rule matches svelte \`${normalize_selector(rule.selector)}\`${where(rule)}\n    svelte: ${body(rule)}`
				);
			} else {
				pkg_blocks.splice(index, 1);
			}
		}
		for (const block of pkg_blocks) {
			const [context, declarations] = block.split('|');
			problems.push(
				`${name}: ${pkg} has a rule no svelte rule matches${context ? ` (in ${context})` : ''}\n    ${pkg}: ${declarations}`
			);
		}
	}
}

function compare_shared_styles() {
	const read = (pkg, file) => readFileSync(join(lib(pkg), 'styles', file), 'utf8');
	const animations = (pkg) => JSON.stringify(parse(read(pkg, 'svedit-animations.css')));
	for (const pkg of ['react', 'vue', 'solid']) {
		if (animations(pkg) !== animations('svelte')) {
			problems.push(`styles/svedit-animations.css: ${pkg} differs from svelte`);
		}
	}
	const variables = (pkg) =>
		parse(read(pkg, 'svedit-colors.css'))
			.flatMap((rule) => rule.declarations.map((d) => d.split(':')[0].trim()))
			.sort()
			.join(', ');
	for (const pkg of ['react', 'vue', 'solid']) {
		if (variables(pkg) !== variables('svelte')) {
			problems.push(
				`styles/svedit-colors.css: ${pkg} defines different variables\n    svelte: ${variables('svelte')}\n    ${pkg}: ${variables(pkg)}`
			);
		}
	}
}

const components = readdirSync(lib('react'))
	.filter((file) => file.endsWith('.css'))
	.map((file) => basename(file, '.css'));

for (const file of readdirSync(lib('solid')).filter((file) => file.endsWith('.css'))) {
	if (!components.includes(basename(file, '.css'))) {
		problems.push(`${file}: solid has a component stylesheet react does not have`);
	}
}
for (const name of components) compare_component(name);
compare_shared_styles();

if (problems.length > 0) {
	console.error(`Component styles drifted apart between the bindings:\n`);
	for (const problem of problems) console.error(`- ${problem}\n`);
	console.error(
		'Apply the change to the matching component in every binding (packages/{svelte,react,vue,solid}/src/lib).'
	);
	process.exit(1);
}
console.log(
	`Component styles in sync across svelte, react, vue and solid (${components.length} components).`
);
