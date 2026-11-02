/**
 * Coverage for rendering node arrays by item key (node id and occurrence)
 * instead of by index.
 *
 * Nodes keep their elements while their indexes shift, but everything that
 * carries a position must follow: the data-path of nodes and their
 * properties, gap offsets, first/last classes and path-based anchor names,
 * also in nested node arrays and for nodes referenced more than once.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import SveditTest from './testing_components/SveditTest.svelte';
import { PATH_SEPARATOR, serialize_path } from '../lib/utils.js';
import { pin_scope_of } from '../lib/node_visibility.svelte.js';
import { make_mixed_session, settle } from './test_utils.js';
import type { DocumentPath, NodeId, PropertyDefinition } from '../lib/types.js';

type MixedSession = ReturnType<typeof make_mixed_session>;
const BODY: DocumentPath = ['page_1', 'body'];
const text = (content: string) => ({ content, marks: [], annotations: [] });

/**
 * Checks a rendered node array and everything in it against the model.
 * Returns the number of node elements it checked.
 */
function expect_array_matches(scope: Element, session: MixedSession, array_path: DocumentPath) {
	const array_str = serialize_path(array_path);
	const array_el = scope.querySelector(`[data-type="node_array"][data-path="${array_str}"]`);
	expect(array_el, array_str).not.toBeNull();
	const ids: NodeId[] = session.get(array_path).nodes;
	if (ids.length === 0) {
		const placeholder = array_el!.querySelector(':scope > .empty-node-placeholder');
		expect(placeholder?.getAttribute('data-path'), array_str).toBe(
			`${array_str}${PATH_SEPARATOR}0`
		);
		return 1;
	}

	const node_els = [...array_el!.querySelectorAll<HTMLElement>(':scope > [data-type="node"]')];
	expect(
		node_els.map((el) => el.dataset.nodeId),
		array_str
	).toEqual(ids);
	let count = ids.length;
	node_els.forEach((el, index) => {
		const path = [...array_path, index];
		const path_str = serialize_path(path);
		expect(el.dataset.path).toBe(path_str);
		expect(el.classList.contains('first'), `${path_str} first`).toBe(index === 0);
		expect(el.classList.contains('last'), `${path_str} last`).toBe(index === ids.length - 1);
		// The gap before a node belongs to it
		const gap = el.previousElementSibling as HTMLElement;
		expect(gap.classList.contains('node-gap'), `${path_str} gap`).toBe(true);
		expect(gap.dataset.gapOffset, `${path_str} gap`).toBe(String(index));

		const node = session.get(path);
		const properties: Record<string, PropertyDefinition> = session.schema[node.type].properties;
		for (const [name, property] of Object.entries(properties)) {
			const property_path = [...path, name];
			if (property.type === 'text') {
				const text_el = el.querySelector(
					`[data-type="text"][data-path="${serialize_path(property_path)}"]`
				);
				expect(text_el?.textContent, serialize_path(property_path)).toBe(node[name].content);
			} else if (property.type === 'node_array') {
				count += expect_array_matches(el, session, property_path);
			}
		}
	});

	const gaps = [...array_el!.querySelectorAll<HTMLElement>(':scope > .node-gap')];
	expect(
		gaps.map((gap) => Number(gap.dataset.gapOffset)),
		`${array_str} gaps`
	).toEqual(Array.from({ length: ids.length + 1 }, (_, i) => i));
	for (const gap of gaps) {
		expect(gap.dataset.gapArrayPath).toBe(array_str);
		// Gaps with a box reference the anchors of the nodes around them
		const next = gap.style.getPropertyValue('--_next').trim();
		if (!next) continue;
		const offset = Number(gap.dataset.gapOffset);
		const owner = offset === 0 ? 0 : offset - 1;
		expect(gap.style.getPropertyValue('--_pa').trim()).toBe(
			`--${array_str}${PATH_SEPARATOR}${owner}`
		);
		expect(next).toBe(`--${array_str}${PATH_SEPARATOR}${offset}`);
	}
	return count;
}

/** Checks the whole rendered document against the model. */
function expect_rendering_matches(container: HTMLElement, session: MixedSession) {
	const count = expect_array_matches(container, session, BODY);
	const body_el = container.querySelector(`[data-type="node_array"][data-path="page_1__body"]`)!;
	// No elements of removed nodes are left behind
	expect(body_el.querySelectorAll('[data-type="node"]').length).toBe(count);
	// Anchor names follow the current paths, and paths are unique
	const paths = new Set<string>();
	for (const el of container.querySelectorAll<HTMLElement>(
		'[data-type="node"], [data-type="text"], [data-type="node_array"]'
	)) {
		const path_str = el.dataset.path!;
		const key = `${el.dataset.type} ${path_str}`;
		expect(paths.has(key), `duplicate ${key}`).toBe(false);
		paths.add(key);
		const anchor = el.getAttribute('style')?.match(/anchor-name:\s*(--[^;\s]+)/)?.[1];
		if (anchor) expect(anchor, key).toBe(`--${path_str}`);
	}
}

/** A seeded pseudo-random number generator (mulberry32). */
function seeded(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Random structural and text edits, including moves and repeated references.
 * Structural edits set node arrays directly, so the selection, which they
 * don't map, is cleared first.
 */
function random_edit(session: MixedSession, random: () => number, step: number) {
	const pick = (length: number) => Math.floor(random() * length);
	session.selection = null;
	const body: NodeId[] = session.get(BODY).nodes;
	const set_body = (nodes: NodeId[], before?: (tr: MixedSession['tr']) => void) => {
		const tr = session.tr;
		before?.(tr);
		tr.set(BODY, { nodes, marks: [], annotations: [] });
		session.apply(tr);
	};
	const story_indexes = body
		.map((id, index) => (session.get(id).type === 'story' ? index : -1))
		.filter((index) => index !== -1);
	const kind = pick(9);

	if (kind === 0 || body.length < 3) {
		const id = `n_${step}`;
		const index = pick(body.length + 1);
		set_body(body.toSpliced(index, 0, id), (tr) =>
			tr.create({ id, type: 'paragraph', content: text(`New ${step}`) })
		);
	} else if (kind === 1) {
		const start = pick(body.length);
		set_body(body.toSpliced(start, 1 + pick(3)));
	} else if (kind === 2) {
		const from = pick(body.length);
		const moved = body.toSpliced(from, 1);
		set_body(moved.toSpliced(pick(moved.length + 1), 0, body[from]));
	} else if (kind === 3) {
		// Another occurrence of a node, a story with its buttons included
		set_body(body.toSpliced(pick(body.length + 1), 0, body[pick(body.length)]));
	} else if (kind === 4 && story_indexes.length) {
		const path = [...BODY, story_indexes[pick(story_indexes.length)], 'buttons'];
		const buttons: NodeId[] = session.get(path).nodes;
		const id = `nb_${step}`;
		const tr = session.tr;
		tr.create({ id, type: 'button', content: text(id), href: '#' });
		tr.set(path, {
			nodes: buttons.toSpliced(pick(buttons.length + 1), 0, id),
			marks: [],
			annotations: []
		});
		session.apply(tr);
	} else if (kind === 5 && story_indexes.length) {
		const path = [...BODY, story_indexes[pick(story_indexes.length)], 'buttons'];
		const buttons: NodeId[] = session.get(path).nodes;
		const tr = session.tr;
		tr.set(path, { nodes: buttons.toSpliced(pick(buttons.length), 1), marks: [], annotations: [] });
		session.apply(tr);
	} else if (kind === 6) {
		session.undo();
	} else if (kind === 7) {
		session.redo();
	} else {
		const index = pick(body.length);
		const node = session.get([...BODY, index]);
		const property = node.type === 'story' ? 'title' : 'content';
		session.selection = {
			type: 'text',
			path: [...BODY, index, property],
			anchor_offset: 0,
			focus_offset: 0
		};
		session.apply(session.tr.insert_text(`${step}`));
	}
}

describe('Keyed rendering', () => {
	beforeEach(() => {
		window.scrollTo(0, 0);
	});

	it('keeps the elements of shifted nodes and updates their paths', async () => {
		const session = make_mixed_session(9);
		const { container } = await render(SveditTest, { session });
		await settle();
		const element_of = (id: NodeId) =>
			container.querySelector<HTMLElement>(`[data-type="node"][data-node-id="${id}"]`)!;
		const before = ['p_0', 's_2', 'b_2_1', 'p_7'].map(element_of);

		const tr = session.tr;
		tr.create({ id: 'p_new', type: 'paragraph', content: text('New') });
		tr.set(BODY, { nodes: ['p_new', ...session.get(BODY).nodes], marks: [], annotations: [] });
		session.apply(tr);
		await tick();

		expect(['p_0', 's_2', 'b_2_1', 'p_7'].map(element_of)).toEqual(before);
		expect(before.map((el) => el.dataset.path)).toEqual([
			'page_1__body__1',
			'page_1__body__3',
			'page_1__body__3__buttons__1',
			'page_1__body__8'
		]);
		expect(
			before[2].querySelector('[data-type="text"]')?.getAttribute('data-path'),
			'text of a nested node'
		).toBe('page_1__body__3__buttons__1__content');
		expect_rendering_matches(container, session);
	});

	it('renders positions that match the model through random edits', async () => {
		const session = make_mixed_session(12);
		const { container } = await render(SveditTest, { session });
		await settle();
		const random = seeded(7);

		for (let step = 0; step < 60; step++) {
			random_edit(session, random, step);
			await tick();
			expect_rendering_matches(container, session);
			// Let the visibility registry catch up now and then, which moves anchor names
			if (step % 10 === 9) {
				await settle();
				expect_rendering_matches(container, session);
			}
		}
	});

	it('renders a node referenced twice in one array at both positions', async () => {
		const session = make_mixed_session(6);
		const { container } = await render(SveditTest, { session });
		await settle();

		const tr = session.tr;
		tr.set(BODY, { nodes: ['p_0', 's_2', 'p_1', 's_2', 'p_0'], marks: [], annotations: [] });
		session.apply(tr);
		await tick();
		expect_rendering_matches(container, session);

		// Both occurrences show an edit of the node
		session.selection = {
			type: 'text',
			path: [...BODY, 4, 'content'],
			anchor_offset: 0,
			focus_offset: 0
		};
		session.apply(session.tr.insert_text('Edited '));
		await tick();
		expect_rendering_matches(container, session);
		expect(
			[...container.querySelectorAll('[data-node-id="p_0"] [data-type="text"]')].map(
				(el) => el.textContent
			)
		).toEqual(['Edited Paragraph 0', 'Edited Paragraph 0']);

		// Removing the first occurrence leaves the second one rendered
		session.selection = null;
		const remove = session.tr;
		remove.set(BODY, { nodes: ['s_2', 'p_1', 's_2', 'p_0'], marks: [], annotations: [] });
		session.apply(remove);
		await tick();
		expect_rendering_matches(container, session);
	});
});

describe('pin_scope_of', () => {
	const lookup =
		(session: MixedSession) =>
		<T>(path: DocumentPath) =>
			session.get(path) as T;

	it('replaces the node array indexes of a path with item keys', () => {
		const get = lookup(make_mixed_session(6));
		expect(pin_scope_of(BODY, get)).toBe('page_1.body');
		expect(pin_scope_of([...BODY, 2, 'buttons'], get)).toBe('page_1.body.s_2:0.buttons');
	});

	it('counts the occurrences of repeated nodes', () => {
		const session = make_mixed_session(6);
		const get = lookup(session);
		const tr = session.tr;
		tr.set(BODY, { nodes: ['s_2', 'p_0', 's_2'], marks: [], annotations: [] });
		session.apply(tr);
		expect(pin_scope_of([...BODY, 0, 'buttons'], get)).toBe('page_1.body.s_2:0.buttons');
		expect(pin_scope_of([...BODY, 2, 'buttons'], get)).toBe('page_1.body.s_2:1.buttons');
	});

	it('continues the pin key of an owning item', () => {
		const get = lookup(make_mixed_session(6));
		const owner = { pin: 'page_1.body.s_2:1', path: [...BODY, 2] };
		expect(pin_scope_of([...BODY, 2, 'buttons'], get, owner)).toBe('page_1.body.s_2:1.buttons');
	});
});
