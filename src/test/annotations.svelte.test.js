import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import create_test_session from './create_test_session.js';
import { are_annotation_ranges_exclusive } from '../lib/utils.js';
import { ToggleAnnotationCommand } from '../lib/Command.svelte.js';
import SveditTest from './testing_components/SveditTest.svelte';
import Section from './testing_components/Section.svelte';
import AnnotationAwareNode from './testing_components/AnnotationAwareNode.svelte';

function create_annotation_session() {
	const session = create_test_session();
	session.schema.strong = { kind: 'annotation', properties: {} };
	session.schema.emphasis = { kind: 'annotation', properties: {} };
	session.schema.section = { kind: 'annotation', properties: {} };
	session.schema.link = { kind: 'annotation', properties: { href: { type: 'string' } } };
	/** @type {any} */ (session.schema.story.properties.title).annotation_types = [
		'strong',
		'emphasis',
		'link'
	];
	/** @type {any} */ (session.schema.page.properties.body).annotation_types = ['section'];
	session.config.node_components.section = Section;
	return session;
}

const title_path = ['story_1', 'title'];
const body_path = ['page_1', 'body'];

function annotation_type(session, annotation) {
	return session.get(annotation.node_id)?.type;
}

function expect_exclusive(annotations) {
	expect(are_annotation_ranges_exclusive(annotations)).toBe(true);
}

function text_selection(anchor_offset, focus_offset) {
	return {
		type: /** @type {const} */ ('text'),
		path: title_path,
		anchor_offset,
		focus_offset
	};
}

function node_selection(anchor_offset, focus_offset) {
	return {
		type: /** @type {const} */ ('node'),
		path: body_path,
		anchor_offset,
		focus_offset
	};
}

function create_annotation(session, type, selection, properties = undefined) {
	session.selection = selection;
	session.apply(session.tr.toggle_annotation(type, properties));
}

function annotation_command(session, type) {
	return new ToggleAnnotationCommand(type, { session, editable: true });
}

describe('annotation toggle selection semantics', () => {
	it('does not consider a collapsed caret at annotation boundaries active', () => {
		for (const caret_offset of [0, 5]) {
			const session = create_annotation_session();
			create_annotation(session, 'strong', text_selection(0, 5));

			session.selection = text_selection(caret_offset, caret_offset);
			expect(session.active_annotation).toBeNull();
			expect(annotation_command(session, 'strong').is_enabled()).toBe(false);

			const before = structuredClone(session.doc);
			session.apply(session.tr.toggle_annotation('strong'));
			expect(session.doc).toEqual(before);
		}
	});

	it('creates a new annotation for a non-collapsed selection adjacent to an existing annotation', () => {
		const session = create_annotation_session();
		create_annotation(session, 'strong', text_selection(0, 5));

		session.selection = text_selection(5, 8);
		session.apply(session.tr.toggle_annotation('emphasis'));

		const annotations = session.get(title_path).annotations;
		expect(annotations).toHaveLength(2);
		expect(annotations[0]).toMatchObject({ start_offset: 0, end_offset: 5 });
		expect(annotation_type(session, annotations[0])).toBe('strong');
		expect(annotations[1]).toMatchObject({ start_offset: 5, end_offset: 8 });
		expect(annotation_type(session, annotations[1])).toBe('emphasis');
		expect_exclusive(annotations);
	});

	it('removes the whole annotation when a selection partially intersects a same-type annotation', () => {
		const session = create_annotation_session();
		create_annotation(session, 'strong', text_selection(0, 5));
		const annotation_id = session.get(title_path).annotations[0].node_id;

		session.selection = text_selection(2, 4);
		session.apply(session.tr.toggle_annotation('strong'));

		expect(session.get(title_path).annotations).toEqual([]);
		expect(session.get(annotation_id)).toBeUndefined();
		expect(session.selection).toEqual(text_selection(2, 4));
	});

	it('switches one property-less annotation to another property-less type and selects its full range', () => {
		const session = create_annotation_session();
		create_annotation(session, 'strong', text_selection(0, 5));

		session.selection = text_selection(2, 4);
		expect(annotation_command(session, 'emphasis').is_enabled()).toBe(true);
		session.apply(session.tr.toggle_annotation('emphasis'));

		const annotations = session.get(title_path).annotations;
		expect(annotations).toHaveLength(1);
		expect(annotations[0]).toMatchObject({ start_offset: 0, end_offset: 5 });
		expect(annotation_type(session, annotations[0])).toBe('emphasis');
		expect(session.selection).toEqual(text_selection(0, 5));
		expect_exclusive(annotations);
	});

	it.each([
		{
			name: 'text',
			value_path: title_path,
			first_selection: text_selection(0, 5),
			second_selection: text_selection(6, 11),
			touching_selection: text_selection(2, 8),
			type: 'strong'
		},
		{
			name: 'node array',
			value_path: body_path,
			first_selection: node_selection(0, 1),
			second_selection: node_selection(1, 2),
			touching_selection: node_selection(0, 2),
			type: 'section'
		}
	])(
		'removes all same-type annotations touched by a $name selection and can recreate one over the selection',
		({ value_path, first_selection, second_selection, touching_selection, type }) => {
			const session = create_annotation_session();
			create_annotation(session, type, first_selection);
			create_annotation(session, type, second_selection);

			session.selection = touching_selection;
			expect(annotation_command(session, type).is_active()).toBe(true);
			expect(annotation_command(session, type).is_enabled()).toBe(true);

			session.apply(session.tr.toggle_annotation(type));
			let annotations = session.get(value_path).annotations;
			expect(annotations).toEqual([]);
			expect(session.selection).toEqual(touching_selection);

			session.apply(session.tr.toggle_annotation(type));
			annotations = session.get(value_path).annotations;
			expect(annotations).toHaveLength(1);
			expect(annotations[0]).toMatchObject({
				start_offset: Math.min(touching_selection.anchor_offset, touching_selection.focus_offset),
				end_offset: Math.max(touching_selection.anchor_offset, touching_selection.focus_offset)
			});
			expect(annotation_type(session, annotations[0])).toBe(type);
			expect_exclusive(annotations);
		}
	);

	it('disables all annotation commands when a selection touches mixed annotation types', () => {
		const session = create_annotation_session();
		create_annotation(session, 'strong', text_selection(0, 5));
		create_annotation(session, 'emphasis', text_selection(6, 11));

		session.selection = text_selection(2, 8);
		expect(annotation_command(session, 'strong').is_enabled()).toBe(false);
		expect(annotation_command(session, 'emphasis').is_enabled()).toBe(false);
		expect(annotation_command(session, 'link').is_enabled()).toBe(false);

		const before = structuredClone(session.doc);
		session.apply(session.tr.toggle_annotation('strong'));
		expect(session.doc).toEqual(before);
	});

	it('only allows switching between annotation types without properties', () => {
		const strong_session = create_annotation_session();
		create_annotation(strong_session, 'strong', text_selection(0, 5));
		strong_session.selection = text_selection(2, 2);
		expect(annotation_command(strong_session, 'emphasis').is_enabled()).toBe(true);
		expect(annotation_command(strong_session, 'link').is_enabled()).toBe(false);

		const link_session = create_annotation_session();
		create_annotation(link_session, 'link', text_selection(0, 5), { href: 'https://example.com' });
		link_session.selection = text_selection(2, 2);
		expect(annotation_command(link_session, 'strong').is_enabled()).toBe(false);
	});

	it('does not render a blurred selection highlight when the selection touches multiple annotations', async () => {
		const session = create_annotation_session();
		create_annotation(session, 'strong', text_selection(0, 5));
		create_annotation(session, 'emphasis', text_selection(6, 11));
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'title'],
			anchor_offset: 2,
			focus_offset: 8
		};

		const { container } = render(SveditTest, { session });
		await tick();

		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();
		await tick();
		canvas.blur();
		await tick();

		expect(container.querySelector('.selection-highlight')).toBeNull();
	});
});

describe('shared text and node annotations', () => {
	it('passes per-node annotation position metadata to node-array children', async () => {
		const session = create_annotation_session();
		session.config.node_components.story = AnnotationAwareNode;
		session.config.node_components.list = AnnotationAwareNode;
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 3
		};
		session.apply(session.tr.toggle_annotation('section'));
		const section_id = session.get(['page_1', 'body']).annotations[0].node_id;

		const { container } = render(SveditTest, { session });
		await tick();

		const nodes = [...container.querySelectorAll('[data-annotation-id]')];
		expect(nodes.every((node) => node.getAttribute('data-annotation-id') === section_id)).toBe(
			true
		);
		expect(nodes.every((node) => node.getAttribute('data-annotation-index') === '0')).toBe(true);
		expect(nodes.every((node) => node.getAttribute('data-annotation-start-offset') === '0')).toBe(
			true
		);
		expect(nodes.every((node) => node.getAttribute('data-annotation-end-offset') === '3')).toBe(
			true
		);
		expect(nodes[0].getAttribute('data-annotation-start')).toBe('true');
		expect(nodes[0].getAttribute('data-annotation-middle')).toBe('false');
		expect(nodes[0].getAttribute('data-annotation-end')).toBe('false');
		expect(nodes[1].getAttribute('data-annotation-start')).toBe('false');
		expect(nodes[1].getAttribute('data-annotation-middle')).toBe('true');
		expect(nodes[1].getAttribute('data-annotation-end')).toBe('false');
		expect(nodes[2].getAttribute('data-annotation-start')).toBe('false');
		expect(nodes[2].getAttribute('data-annotation-middle')).toBe('false');
		expect(nodes[2].getAttribute('data-annotation-end')).toBe('true');
	});

	it.each([
		{
			name: 'text',
			selection: {
				type: 'text',
				path: ['story_1', 'title'],
				anchor_offset: 0,
				focus_offset: 5
			},
			value_path: ['story_1', 'title'],
			first_type: 'strong',
			second_type: 'strong'
		},
		{
			name: 'nodes',
			selection: {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 2
			},
			value_path: ['page_1', 'body'],
			first_type: 'section',
			second_type: 'section'
		}
	])(
		'toggles $name annotations with the same create/remove/create behavior',
		({ selection, value_path, first_type, second_type }) => {
			const session = create_annotation_session();
			session.selection = /** @type {any} */ (selection);

			session.apply(session.tr.toggle_annotation(first_type));
			let value = session.get(value_path);
			expect(value.annotations).toHaveLength(1);
			expect(annotation_type(session, value.annotations[0])).toBe(first_type);
			expect(session.selection).toEqual(selection);
			expect_exclusive(value.annotations);

			session.apply(session.tr.toggle_annotation(second_type));
			value = session.get(value_path);
			expect(value.annotations).toEqual([]);
			expect(session.selection).toEqual(selection);

			session.apply(session.tr.toggle_annotation(second_type));
			value = session.get(value_path);
			expect(value.annotations).toHaveLength(1);
			expect(annotation_type(session, value.annotations[0])).toBe(second_type);
			expect(session.selection).toEqual(selection);
			expect_exclusive(value.annotations);
		}
	);

	it('switches an overlapping text annotation to another property-less annotation type', () => {
		const session = create_annotation_session();
		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 5
		};
		session.apply(session.tr.toggle_annotation('strong'));

		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 3,
			focus_offset: 8
		};
		session.apply(session.tr.toggle_annotation('emphasis'));
		const annotations = session.get(['story_1', 'title']).annotations;
		expect(annotations).toHaveLength(1);
		expect(annotation_type(session, annotations[0])).toBe('emphasis');
		expect(annotations[0]).toMatchObject({ start_offset: 0, end_offset: 5 });
		expect(session.selection).toEqual(text_selection(0, 5));
		expect_exclusive(annotations);
	});

	it('supports backward node selections and rejects collapsed selections', () => {
		const session = create_annotation_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 0
		};
		session.apply(session.tr.toggle_annotation('section'));
		expect(session.get(['page_1', 'body']).annotations[0]).toMatchObject({
			start_offset: 0,
			end_offset: 2
		});

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 2,
			focus_offset: 2
		};
		const before = structuredClone(session.doc);
		session.apply(session.tr.toggle_annotation('section'));
		expect(session.doc).toEqual(before);
	});

	it.each([
		{
			name: 'text',
			selection: {
				type: 'text',
				path: ['story_1', 'title'],
				anchor_offset: 2,
				focus_offset: 4
			},
			annotation_selection: {
				type: 'text',
				path: ['story_1', 'title'],
				anchor_offset: 0,
				focus_offset: 5
			},
			value_path: ['story_1', 'title'],
			type: 'strong',
			expected_end: 3
		},
		{
			name: 'nodes',
			selection: {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 1,
				focus_offset: 2
			},
			annotation_selection: {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 3
			},
			value_path: ['page_1', 'body'],
			type: 'section',
			expected_end: 2
		}
	])(
		'uses the same annotation transfer semantics when deleting $name',
		({ selection, annotation_selection, value_path, type, expected_end }) => {
			const session = create_annotation_session();
			session.selection = /** @type {any} */ (annotation_selection);
			session.apply(session.tr.toggle_annotation(type));

			session.selection = /** @type {any} */ (selection);
			session.apply(session.tr.delete_selection());

			const annotations = session.get(value_path).annotations;
			expect(annotations).toHaveLength(1);
			expect(annotations[0]).toMatchObject({
				start_offset: 0,
				end_offset: expected_end
			});
			expect_exclusive(annotations);
		}
	);

	it('extends node annotations for insertion inside, but not at their edges', () => {
		const session = create_annotation_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 2
		};
		session.apply(session.tr.toggle_annotation('section'));

		const inside = session.tr;
		inside.set_selection({
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 1,
			focus_offset: 1
		});
		inside.create({
			id: 'inside_paragraph',
			type: 'paragraph',
			layout: 1,
			content: { content: 'inside', annotations: [] }
		});
		inside.insert_nodes(['inside_paragraph']);
		session.apply(inside);
		expect(session.get(['page_1', 'body']).annotations[0]).toMatchObject({
			start_offset: 0,
			end_offset: 3
		});

		const edge = session.tr;
		edge.set_selection({
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 3,
			focus_offset: 3
		});
		edge.create({
			id: 'edge_paragraph',
			type: 'paragraph',
			layout: 1,
			content: { content: 'edge', annotations: [] }
		});
		edge.insert_nodes(['edge_paragraph']);
		session.apply(edge);
		const annotations = session.get(['page_1', 'body']).annotations;
		expect(annotations[0]).toMatchObject({ start_offset: 0, end_offset: 3 });
		expect_exclusive(annotations);
	});

	it('uses the same insertion transfer semantics for annotated text', () => {
		const session = create_annotation_session();
		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 0,
			focus_offset: 5
		};
		session.apply(session.tr.toggle_annotation('strong'));

		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 2,
			focus_offset: 2
		};
		session.apply(session.tr.insert_text('X'));
		let annotations = session.get(['story_1', 'title']).annotations;
		expect(annotations[0]).toMatchObject({ start_offset: 0, end_offset: 6 });

		session.selection = {
			type: 'text',
			path: ['story_1', 'title'],
			anchor_offset: 6,
			focus_offset: 6
		};
		session.apply(session.tr.insert_text('Y'));
		annotations = session.get(['story_1', 'title']).annotations;
		expect(annotations[0]).toMatchObject({ start_offset: 0, end_offset: 6 });
		expect_exclusive(annotations);
	});

	it.each([
		{
			name: 'text',
			selection: {
				type: 'text',
				path: ['story_1', 'title'],
				anchor_offset: 0,
				focus_offset: 5
			},
			value_path: ['story_1', 'title'],
			type: 'strong'
		},
		{
			name: 'nodes',
			selection: {
				type: 'node',
				path: ['page_1', 'body'],
				anchor_offset: 0,
				focus_offset: 2
			},
			value_path: ['page_1', 'body'],
			type: 'section'
		}
	])(
		'removes fully deleted $name annotations and their nodes',
		({ selection, value_path, type }) => {
			const session = create_annotation_session();
			session.selection = /** @type {any} */ (selection);
			session.apply(session.tr.toggle_annotation(type));
			const annotation_id = session.get(value_path).annotations[0].node_id;

			session.selection = /** @type {any} */ (selection);
			session.apply(session.tr.delete_selection());

			expect(session.get(value_path).annotations).toEqual([]);
			expect(session.get(annotation_id)).toBeUndefined();
		}
	);

	it('preserves clipped node-array annotations across cut and paste', () => {
		const session = create_annotation_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 2
		};
		session.apply(session.tr.toggle_annotation('section'));

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 1,
			focus_offset: 2
		};
		const payload = session.get_selected_annotated_nodes();
		expect(payload.annotations).toEqual([
			{ start_offset: 0, end_offset: 1, node_id: expect.any(String) }
		]);

		session.apply(session.tr.delete_selection());
		let body = session.get(['page_1', 'body']);
		expect(body.annotations[0]).toMatchObject({ start_offset: 0, end_offset: 1 });

		const tr = session.tr;
		tr.set_selection({
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: body.nodes.length,
			focus_offset: body.nodes.length
		});
		const pasted_node_ids = payload.main_nodes.map((node_id) => tr.build(node_id, payload.nodes));
		tr.insert_nodes(pasted_node_ids, payload.annotations, payload.nodes);
		session.apply(tr);

		body = session.get(['page_1', 'body']);
		expect(body.annotations).toHaveLength(2);
		expect(body.annotations[1]).toMatchObject({
			start_offset: body.nodes.length - 1,
			end_offset: body.nodes.length
		});
		expect(annotation_type(session, body.annotations[1])).toBe('section');
		expect_exclusive(body.annotations);
	});

	it('never restores pasted annotations over an existing node annotation', () => {
		const session = create_annotation_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		session.apply(session.tr.toggle_annotation('section'));
		const payload = session.get_selected_annotated_nodes();

		const tr = session.tr;
		tr.set_selection({
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 0
		});
		const pasted_node_ids = payload.main_nodes.map((node_id) => tr.build(node_id, payload.nodes));
		tr.insert_nodes(pasted_node_ids, payload.annotations, payload.nodes);
		session.apply(tr);

		const annotations = session.get(['page_1', 'body']).annotations;
		expect(annotations).toHaveLength(1);
		expect_exclusive(annotations);
	});

	it('rejects overlapping annotations from a node clipboard payload', () => {
		const session = create_annotation_session();
		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		session.apply(session.tr.toggle_annotation('section'));
		const payload = session.get_selected_annotated_nodes();

		const tr = session.tr;
		tr.set_selection({
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 3,
			focus_offset: 3
		});
		const pasted_node_ids = payload.main_nodes.map((node_id) => tr.build(node_id, payload.nodes));
		tr.insert_nodes(
			pasted_node_ids,
			[payload.annotations[0], { ...payload.annotations[0] }],
			payload.nodes
		);
		session.apply(tr);

		const annotations = session.get(['page_1', 'body']).annotations;
		expect(annotations).toHaveLength(1);
		expect_exclusive(annotations);
	});

	it('rejects overlapping node-array annotations at transaction validation', () => {
		const session = create_annotation_session();
		const tr = session.tr;
		tr.create({ id: 'section_a', type: 'section' });
		tr.create({ id: 'section_b', type: 'section' });
		const body = structuredClone(tr.get(['page_1', 'body']));
		body.annotations = [
			{ start_offset: 0, end_offset: 2, node_id: 'section_a' },
			{ start_offset: 1, end_offset: 3, node_id: 'section_b' }
		];
		tr.set(['page_1', 'body'], body);

		expect(() => session.apply(tr)).toThrow('overlapping annotations');
	});

	it('transfers node-array annotations through the actual cut and paste handlers', async () => {
		const session = create_annotation_session();
		const { container } = render(SveditTest, { session });
		const canvas = /** @type {HTMLElement} */ (container.querySelector('.svedit-canvas'));
		canvas.focus();

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: 0,
			focus_offset: 1
		};
		session.apply(session.tr.toggle_annotation('section'));
		await tick();

		let copied_html = '';
		const clipboard_data = {
			setData(format, data) {
				if (format === 'text/html') copied_html = data;
			},
			getData(format) {
				return format === 'text/html' ? copied_html : '';
			},
			items: []
		};
		const cut_event = new ClipboardEvent('cut', { bubbles: true, cancelable: true });
		Object.defineProperty(cut_event, 'clipboardData', { value: clipboard_data });
		document.dispatchEvent(cut_event);
		await tick();

		let body = session.get(['page_1', 'body']);
		expect(body.nodes).toHaveLength(2);
		expect(body.annotations).toEqual([]);

		session.selection = {
			type: 'node',
			path: ['page_1', 'body'],
			anchor_offset: body.nodes.length,
			focus_offset: body.nodes.length
		};
		const paste_event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(paste_event, 'clipboardData', { value: clipboard_data });
		document.dispatchEvent(paste_event);
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));

		body = session.get(['page_1', 'body']);
		expect(body.nodes).toHaveLength(3);
		expect(body.annotations).toHaveLength(1);
		expect(body.annotations[0]).toMatchObject({ start_offset: 2, end_offset: 3 });
		expect(annotation_type(session, body.annotations[0])).toBe('section');
		expect_exclusive(body.annotations);
	});
});
