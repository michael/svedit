import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import create_test_session from './create_test_session.js';
import { are_annotation_ranges_exclusive } from '../lib/utils.js';
import SveditTest from './testing_components/SveditTest.svelte';
import Section from './testing_components/Section.svelte';
import AnnotationAwareNode from './testing_components/AnnotationAwareNode.svelte';

function create_annotation_session() {
	const session = create_test_session();
	session.schema.strong = { kind: 'annotation', properties: {} };
	session.schema.emphasis = { kind: 'annotation', properties: {} };
	session.schema.section = { kind: 'annotation', properties: {} };
	/** @type {any} */ (session.schema.story.properties.title).annotation_types = [
		'strong',
		'emphasis'
	];
	/** @type {any} */ (session.schema.page.properties.body).annotation_types = ['section'];
	session.config.node_components.section = Section;
	return session;
}

function annotation_type(session, annotation) {
	return session.get(annotation.node_id)?.type;
}

function expect_exclusive(annotations) {
	expect(are_annotation_ranges_exclusive(annotations)).toBe(true);
}

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
			second_type: 'emphasis'
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

	it('removes an overlapping text annotation before creating another annotation type', () => {
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
		expect(session.get(['story_1', 'title']).annotations).toEqual([]);

		session.apply(session.tr.toggle_annotation('emphasis'));
		const annotations = session.get(['story_1', 'title']).annotations;
		expect(annotations).toHaveLength(1);
		expect(annotation_type(session, annotations[0])).toBe('emphasis');
		expect(annotations[0]).toMatchObject({ start_offset: 3, end_offset: 8 });
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
