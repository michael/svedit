import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import create_test_session from './create_test_session.js';
import Session from '../lib/Session.svelte.js';
import { are_ranges_exclusive } from '../lib/utils.js';
import { ToggleMarkCommand, ToggleAnnotationCommand } from '../lib/Command.svelte.js';
import SveditTest from './testing_components/SveditTest.svelte';
import Section from './testing_components/Section.svelte';
import AnnotationAwareNode from './testing_components/AnnotationAwareNode.svelte';

function create_annotation_session() {
	const session = create_test_session();
	// The test session shares module-level schema/config objects; clone them so
	// per-test mutations (adding types, swapping or deleting components) don't
	// leak into other tests.
	session.schema = structuredClone(session.schema);
	session.config = {
		...session.config,
		node_components: { ...session.config.node_components }
	};
	session.schema.strong = { kind: 'mark', properties: {} };
	session.schema.emphasis = { kind: 'mark', properties: {} };
	session.schema.section = { kind: 'mark', properties: {} };
	session.schema.link = { kind: 'mark', properties: { href: { type: 'string' } } };
	session.schema.comment = { kind: 'annotation', properties: {} };
	session.schema.note = { kind: 'annotation', properties: {} };
	(session.schema.story.properties.title as any).mark_types = ['strong', 'emphasis', 'link'];
	(session.schema.story.properties.title as any).annotation_types = ['comment', 'note'];
	(session.schema.page.properties.body as any).mark_types = ['section'];
	(session.schema.page.properties.body as any).annotation_types = ['comment', 'note'];
	session.config.node_components.section = Section;
	return session;
}

const title_path = ['story_1', 'title'];
const body_path = ['page_1', 'body'];

function range_type(session: any, range: any) {
	return session.get(range.node_id)?.type;
}

function expect_exclusive(ranges: any[]) {
	expect(are_ranges_exclusive(ranges)).toBe(true);
}

function text_selection(anchor_offset: number, focus_offset: number) {
	return {
		type: 'text' as const,
		path: title_path,
		anchor_offset,
		focus_offset
	};
}

function rendered_title_selection(anchor_offset: number, focus_offset: number) {
	return {
		type: 'text' as const,
		path: ['page_1', 'body', 0, 'title'],
		anchor_offset,
		focus_offset
	};
}

function node_selection(anchor_offset: number, focus_offset: number) {
	return {
		type: 'node' as const,
		path: body_path,
		anchor_offset,
		focus_offset
	};
}

function create_mark(session: any, type: string, selection: any, properties: any = undefined) {
	session.selection = selection;
	session.apply(session.tr.toggle_mark(type, properties));
}

function create_annotation(
	session: any,
	type: string,
	selection: any,
	properties: any = undefined
) {
	session.selection = selection;
	session.apply(session.tr.toggle_annotation(type, properties));
}

function mark_command(session: any, type: string) {
	return new ToggleMarkCommand(type, { session, editable: true });
}

function annotation_command(session: any, type: string) {
	return new ToggleAnnotationCommand(type, { session, editable: true });
}

describe('mark toggle selection semantics', () => {
	it('does not consider a collapsed caret at mark boundaries active', () => {
		for (const caret_offset of [0, 5]) {
			const session = create_annotation_session();
			create_mark(session, 'strong', text_selection(0, 5));

			session.selection = text_selection(caret_offset, caret_offset);
			expect(session.active_mark).toBeNull();
			expect(mark_command(session, 'strong').is_enabled()).toBe(false);

			const before = structuredClone(session.doc);
			session.apply(session.tr.toggle_mark('strong'));
			expect(session.doc).toEqual(before);
		}
	});

	it('creates a new mark for a non-collapsed selection adjacent to an existing mark', () => {
		const session = create_annotation_session();
		create_mark(session, 'strong', text_selection(0, 5));

		session.selection = text_selection(5, 8);
		session.apply(session.tr.toggle_mark('emphasis'));

		const marks = session.get(title_path).marks;
		expect(marks).toHaveLength(2);
		expect(marks[0]).toMatchObject({ start_offset: 0, end_offset: 5 });
		expect(range_type(session, marks[0])).toBe('strong');
		expect(marks[1]).toMatchObject({ start_offset: 5, end_offset: 8 });
		expect(range_type(session, marks[1])).toBe('emphasis');
		expect_exclusive(marks);
	});

	it('removes the whole mark when a selection partially intersects a same-type mark', () => {
		const session = create_annotation_session();
		create_mark(session, 'strong', text_selection(0, 5));
		const mark_id = session.get(title_path).marks[0].node_id;

		session.selection = text_selection(2, 4);
		session.apply(session.tr.toggle_mark('strong'));

		expect(session.get(title_path).marks).toEqual([]);
		expect(session.get(mark_id)).toBeUndefined();
		expect(session.selection).toEqual(text_selection(2, 4));
	});

	it('switches one property-less mark to another property-less type and selects its full range', () => {
		const session = create_annotation_session();
		create_mark(session, 'strong', text_selection(0, 5));

		session.selection = text_selection(2, 4);
		expect(mark_command(session, 'emphasis').is_enabled()).toBe(true);
		session.apply(session.tr.toggle_mark('emphasis'));

		const marks = session.get(title_path).marks;
		expect(marks).toHaveLength(1);
		expect(marks[0]).toMatchObject({ start_offset: 0, end_offset: 5 });
		expect(range_type(session, marks[0])).toBe('emphasis');
		expect(session.selection).toEqual(text_selection(0, 5));
		expect_exclusive(marks);
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
		'removes all same-type marks touched by a $name selection and can recreate one over the selection',
		({ value_path, first_selection, second_selection, touching_selection, type }) => {
			const session = create_annotation_session();
			create_mark(session, type, first_selection);
			create_mark(session, type, second_selection);

			session.selection = touching_selection;
			expect(mark_command(session, type).is_active()).toBe(true);
			expect(mark_command(session, type).is_enabled()).toBe(true);

			session.apply(session.tr.toggle_mark(type));
			let marks = session.get(value_path).marks;
			expect(marks).toEqual([]);
			expect(session.selection).toEqual(touching_selection);

			session.apply(session.tr.toggle_mark(type));
			marks = session.get(value_path).marks;
			expect(marks).toHaveLength(1);
			expect(marks[0]).toMatchObject({
				start_offset: Math.min(touching_selection.anchor_offset, touching_selection.focus_offset),
				end_offset: Math.max(touching_selection.anchor_offset, touching_selection.focus_offset)
			});
			expect(range_type(session, marks[0])).toBe(type);
			expect_exclusive(marks);
		}
	);

	it('disables all mark commands when a selection touches mixed mark types', () => {
		const session = create_annotation_session();
		create_mark(session, 'strong', text_selection(0, 5));
		create_mark(session, 'emphasis', text_selection(6, 11));

		session.selection = text_selection(2, 8);
		expect(mark_command(session, 'strong').is_enabled()).toBe(false);
		expect(mark_command(session, 'emphasis').is_enabled()).toBe(false);
		expect(mark_command(session, 'link').is_enabled()).toBe(false);

		const before = structuredClone(session.doc);
		session.apply(session.tr.toggle_mark('strong'));
		expect(session.doc).toEqual(before);
	});

	it('only allows switching between mark types without properties', () => {
		const strong_session = create_annotation_session();
		create_mark(strong_session, 'strong', text_selection(0, 5));
		strong_session.selection = text_selection(2, 2);
		expect(mark_command(strong_session, 'emphasis').is_enabled()).toBe(true);
		expect(mark_command(strong_session, 'link').is_enabled()).toBe(false);

		const link_session = create_annotation_session();
		create_mark(link_session, 'link', text_selection(0, 5), { href: 'https://example.com' });
		link_session.selection = text_selection(2, 2);
		expect(mark_command(link_session, 'strong').is_enabled()).toBe(false);
	});

	it('does not render a blurred selection highlight when the selection touches multiple marks', async () => {
		const session = create_annotation_session();
		create_mark(session, 'strong', text_selection(0, 5));
		create_mark(session, 'emphasis', text_selection(6, 11));
		session.selection = {
			type: 'text',
			path: ['page_1', 'body', 0, 'title'],
			anchor_offset: 2,
			focus_offset: 8
		};

		const { container } = render(SveditTest, { session });
		await tick();

		const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
		canvas.focus();
		await tick();
		canvas.blur();
		await tick();

		expect(container.querySelector('.selection-highlight')).toBeNull();
	});
});

describe('annotation toggle selection semantics', () => {
	it('restores an unchanged text selection without scrolling after an annotation toggle', async () => {
		const session = create_annotation_session();
		const { container } = render(SveditTest, { session });
		await tick();
		const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
		const scroll_into_view = vi.spyOn(Element.prototype, 'scrollIntoView');

		try {
			canvas.focus();
			session.selection = rendered_title_selection(0, 5);
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 10));
			scroll_into_view.mockClear();

			session.apply(session.tr.toggle_annotation('comment'));
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(window.getSelection()?.toString()).toBe('First');
			expect(scroll_into_view).not.toHaveBeenCalled();
		} finally {
			scroll_into_view.mockRestore();
		}
	});

	it('still scrolls when the logical text selection moves', async () => {
		const session = create_annotation_session();
		const { container } = render(SveditTest, { session });
		await tick();
		const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
		const scroll_into_view = vi.spyOn(Element.prototype, 'scrollIntoView');

		try {
			canvas.focus();
			session.selection = rendered_title_selection(0, 5);
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 10));
			scroll_into_view.mockClear();

			session.selection = rendered_title_selection(6, 11);
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(window.getSelection()?.toString()).toBe('story');
			expect(scroll_into_view).toHaveBeenCalledOnce();
		} finally {
			scroll_into_view.mockRestore();
		}
	});

	it('creates and removes same-type annotations without stacking', () => {
		const session = create_annotation_session();
		create_annotation(session, 'comment', text_selection(0, 5));

		let annotations = session.get(title_path).annotations;
		expect(annotations).toHaveLength(1);
		expect(annotations[0]).toMatchObject({ start_offset: 0, end_offset: 5 });
		expect(range_type(session, annotations[0])).toBe('comment');

		// Toggling with a selection touching the same-type annotation removes it
		// instead of stacking a second one.
		session.selection = text_selection(2, 8);
		expect(annotation_command(session, 'comment').is_active()).toBe(true);
		session.apply(session.tr.toggle_annotation('comment'));
		expect(session.get(title_path).annotations).toEqual([]);
	});

	it('ignores marks and other annotation types when toggling', () => {
		const session = create_annotation_session();
		create_mark(session, 'strong', text_selection(0, 5));
		create_annotation(session, 'note', text_selection(1, 6));

		// A comment toggle is not blocked by the touched strong mark or the
		// touched note annotation.
		session.selection = text_selection(0, 8);
		expect(annotation_command(session, 'comment').is_enabled()).toBe(true);
		expect(annotation_command(session, 'comment').is_active()).toBe(false);
		session.apply(session.tr.toggle_annotation('comment'));

		const value = session.get(title_path);
		expect(value.marks).toHaveLength(1);
		expect(value.annotations).toHaveLength(2);
		expect(range_type(session, value.annotations[0])).toBe('note');
		expect(range_type(session, value.annotations[1])).toBe('comment');

		// Toggling off removes only the comment.
		session.apply(session.tr.toggle_annotation('comment'));
		expect(session.get(title_path).annotations).toHaveLength(1);
		expect(range_type(session, session.get(title_path).annotations[0])).toBe('note');
	});

	it('removes a same-type annotation from a collapsed caret inside it', () => {
		const session = create_annotation_session();
		create_annotation(session, 'comment', text_selection(0, 5));

		session.selection = text_selection(2, 2);
		expect(annotation_command(session, 'comment').is_active()).toBe(true);
		expect(annotation_command(session, 'comment').is_enabled()).toBe(true);
		session.apply(session.tr.toggle_annotation('comment'));
		expect(session.get(title_path).annotations).toEqual([]);
	});

	it('allows same-type annotations to overlap when created through lower-level APIs', () => {
		const session = create_annotation_session();
		const tr = session.tr;
		tr.create({ id: 'comment_a', type: 'comment' });
		tr.create({ id: 'comment_b', type: 'comment' });
		const title = structuredClone(tr.get(title_path));
		title.annotations = [
			{ start_offset: 0, end_offset: 5, node_id: 'comment_a' },
			{ start_offset: 3, end_offset: 8, node_id: 'comment_b' }
		];
		tr.set(title_path, title);

		expect(() => session.apply(tr)).not.toThrow();
	});

	it('toggles a mark across overlapping annotations', () => {
		const session = create_annotation_session();
		const setup = session.tr;
		setup.create({ id: 'comment_a', type: 'comment' });
		const body = structuredClone(setup.get(body_path));
		body.annotations = [{ start_offset: 0, end_offset: 3, node_id: 'comment_a' }];
		setup.set(body_path, body);
		session.apply(setup);

		session.selection = node_selection(0, 2);
		expect(mark_command(session, 'section').is_enabled()).toBe(true);
		expect(mark_command(session, 'section').is_active()).toBe(false);

		session.apply(session.tr.toggle_mark('section'));
		let value = session.get(body_path);
		expect(value.annotations).toHaveLength(1);
		expect(value.marks).toHaveLength(1);
		expect(range_type(session, value.marks[0])).toBe('section');
		expect(value.marks[0]).toMatchObject({ start_offset: 0, end_offset: 2 });

		// Toggling off removes only the section mark, the comment stays
		expect(mark_command(session, 'section').is_active()).toBe(true);
		session.apply(session.tr.toggle_mark('section'));
		value = session.get(body_path);
		expect(value.marks).toEqual([]);
		expect(value.annotations).toHaveLength(1);
		expect(value.annotations[0].node_id).toBe('comment_a');
	});

	it('toggles an annotation over a mark without touching it', () => {
		const session = create_annotation_session();
		create_mark(session, 'section', node_selection(0, 2));

		session.selection = node_selection(0, 3);
		expect(annotation_command(session, 'comment').is_enabled()).toBe(true);
		expect(annotation_command(session, 'comment').is_active()).toBe(false);

		session.apply(session.tr.toggle_annotation('comment'));
		let value = session.get(body_path);
		expect(value.marks).toHaveLength(1);
		expect(value.annotations).toHaveLength(1);
		expect(range_type(session, value.annotations[0])).toBe('comment');
		expect(value.annotations[0]).toMatchObject({ start_offset: 0, end_offset: 3 });

		// Removing the comment leaves the section mark untouched
		expect(annotation_command(session, 'comment').is_active()).toBe(true);
		session.apply(session.tr.toggle_annotation('comment'));
		value = session.get(body_path);
		expect(value.annotations).toEqual([]);
		expect(value.marks).toHaveLength(1);
		expect(range_type(session, value.marks[0])).toBe('section');
	});
});

describe('schema and config validation', () => {
	it('rejects a registered component for a kind annotation type', () => {
		const session = create_annotation_session();
		const config = {
			...session.config,
			node_components: { ...session.config.node_components, comment: Section }
		};

		expect(() => new Session(session.schema, structuredClone(session.doc), config)).toThrow(
			'must not have a registered component'
		);
	});

	it('rejects mark_types referencing non-mark node types', () => {
		const session = create_test_session();
		const schema = structuredClone(session.schema);
		schema.comment = { kind: 'annotation', properties: {} };
		(schema.story.properties.title as any).mark_types = ['comment'];

		expect(() => new Session(schema, structuredClone(session.doc), session.config)).toThrow(
			"mark_types must reference node types of kind 'mark'"
		);
	});

	it('rejects annotation_types referencing non-annotation node types', () => {
		const session = create_test_session();
		const schema = structuredClone(session.schema);
		schema.strong = { kind: 'mark', properties: {} };
		(schema.story.properties.title as any).annotation_types = ['strong'];

		expect(() => new Session(schema, structuredClone(session.doc), session.config)).toThrow(
			"annotation_types must reference node types of kind 'annotation'"
		);
	});
});

describe('shared text and node marks and annotations', () => {
	it('renders text marks as class-only wrappers when no mark component is registered', async () => {
		const session = create_annotation_session();
		create_mark(session, 'strong', text_selection(0, 5));
		const mark_id = session.get(title_path).marks[0].node_id;
		delete session.config.node_components.strong;

		const { container } = render(SveditTest, { session });
		await tick();

		expect(container.textContent).toContain('First story');
		expect(container.querySelector(`[data-node-id="${mark_id}"]`)).toBeNull();
		const wrapper = container.querySelector('.mark-strong');
		expect(wrapper).not.toBeNull();
		expect(wrapper.textContent).toBe('First');
	});

	it('renders node-array marks without a component transparently but still exposes the mark prop', async () => {
		const session = create_annotation_session();
		session.config.node_components.story = AnnotationAwareNode;
		session.config.node_components.list = AnnotationAwareNode;
		create_mark(session, 'section', node_selection(0, 3));
		const section_id = session.get(body_path).marks[0].node_id;
		delete session.config.node_components.section;

		const { container } = render(SveditTest, { session });
		await tick();

		expect(container.querySelector('section')).toBeNull();
		const nodes = [...container.querySelectorAll('[data-mark-id]')];
		expect(nodes).toHaveLength(3);
		// Marks are content-level even without a component, so the `mark` prop
		// is still exposed to covered children.
		expect(nodes.every((node) => node.getAttribute('data-mark-id') === section_id)).toBe(true);
	});

	it('passes per-node mark position metadata to node-array children', async () => {
		const session = create_annotation_session();
		session.config.node_components.story = AnnotationAwareNode;
		session.config.node_components.list = AnnotationAwareNode;
		session.selection = node_selection(0, 3);
		session.apply(session.tr.toggle_mark('section'));
		const section_id = session.get(body_path).marks[0].node_id;

		const { container } = render(SveditTest, { session });
		await tick();

		const nodes = [...container.querySelectorAll('[data-mark-id]')];
		expect(nodes.every((node) => node.getAttribute('data-mark-id') === section_id)).toBe(true);
		expect(nodes.every((node) => node.getAttribute('data-mark-index') === '0')).toBe(true);
		expect(nodes.every((node) => node.getAttribute('data-mark-start-offset') === '0')).toBe(true);
		expect(nodes.every((node) => node.getAttribute('data-mark-end-offset') === '3')).toBe(true);
		expect(nodes[0].getAttribute('data-mark-start')).toBe('true');
		expect(nodes[0].getAttribute('data-mark-middle')).toBe('false');
		expect(nodes[0].getAttribute('data-mark-end')).toBe('false');
		expect(nodes[1].getAttribute('data-mark-start')).toBe('false');
		expect(nodes[1].getAttribute('data-mark-middle')).toBe('true');
		expect(nodes[1].getAttribute('data-mark-end')).toBe('false');
		expect(nodes[2].getAttribute('data-mark-start')).toBe('false');
		expect(nodes[2].getAttribute('data-mark-middle')).toBe('false');
		expect(nodes[2].getAttribute('data-mark-end')).toBe('true');
	});

	it('exposes a mark and overlapping annotations to node-array children independently', async () => {
		const session = create_annotation_session();
		session.config.node_components.story = AnnotationAwareNode;
		session.config.node_components.list = AnnotationAwareNode;
		const tr = session.tr;
		tr.create({ id: 'section_a', type: 'section' });
		tr.create({ id: 'comment_a', type: 'comment' });
		tr.create({ id: 'comment_b', type: 'comment' });
		const body = structuredClone(tr.get(body_path));
		body.marks = [{ start_offset: 0, end_offset: 2, node_id: 'section_a' }];
		body.annotations = [
			{ start_offset: 0, end_offset: 3, node_id: 'comment_a' },
			{ start_offset: 1, end_offset: 3, node_id: 'comment_b' }
		];
		tr.set(body_path, body);

		expect(() => session.apply(tr)).not.toThrow();

		const { container } = render(SveditTest, { session });
		await tick();

		const nodes = [...container.querySelectorAll('[data-mark-id]')];
		expect(nodes[0].getAttribute('data-mark-id')).toBe('section_a');
		expect(nodes[0].getAttribute('data-annotations-count')).toBe('1');
		expect(nodes[0].getAttribute('data-annotations-ids')).toBe('comment_a');
		expect(nodes[1].getAttribute('data-mark-id')).toBe('section_a');
		expect(nodes[1].getAttribute('data-annotations-count')).toBe('2');
		expect(nodes[1].getAttribute('data-annotations-ids')).toBe('comment_a,comment_b');
		expect(nodes[2].getAttribute('data-mark-id')).toBe('');
		expect(nodes[2].getAttribute('data-annotations-count')).toBe('2');
		expect(nodes[2].getAttribute('data-annotations-ids')).toBe('comment_a,comment_b');
	});

	it('passes overlapping node-array annotations through annotations plural', async () => {
		const session = create_annotation_session();
		session.config.node_components.story = AnnotationAwareNode;
		session.config.node_components.list = AnnotationAwareNode;
		const tr = session.tr;
		tr.create({ id: 'comment_a', type: 'comment' });
		tr.create({ id: 'comment_b', type: 'comment' });
		const body = structuredClone(tr.get(body_path));
		body.annotations = [
			{ start_offset: 0, end_offset: 2, node_id: 'comment_a' },
			{ start_offset: 1, end_offset: 3, node_id: 'comment_b' }
		];
		tr.set(body_path, body);
		session.apply(tr);

		const { container } = render(SveditTest, { session });
		await tick();

		const nodes = [...container.querySelectorAll('[data-mark-id]')];
		// Annotations are never exposed via `mark`.
		expect(nodes[0].getAttribute('data-mark-id')).toBe('');
		expect(nodes[0].getAttribute('data-annotations-count')).toBe('1');
		expect(nodes[0].getAttribute('data-annotations-ids')).toBe('comment_a');
		expect(nodes[1].getAttribute('data-mark-id')).toBe('');
		expect(nodes[1].getAttribute('data-annotations-count')).toBe('2');
		expect(nodes[1].getAttribute('data-annotations-ids')).toBe('comment_a,comment_b');
		expect(nodes[2].getAttribute('data-mark-id')).toBe('');
		expect(nodes[2].getAttribute('data-annotations-count')).toBe('1');
		expect(nodes[2].getAttribute('data-annotations-ids')).toBe('comment_b');
	});

	it('adds annotation classes to covered node wrappers automatically', async () => {
		const session = create_annotation_session();
		const tr = session.tr;
		tr.create({ id: 'comment_a', type: 'comment' });
		const body = structuredClone(tr.get(body_path));
		body.annotations = [{ start_offset: 0, end_offset: 3, node_id: 'comment_a' }];
		tr.set(body_path, body);
		session.apply(tr);

		const { container } = render(SveditTest, { session });
		await tick();

		const covered = [...container.querySelectorAll('[data-type="node"].anno-comment')];
		expect(covered).toHaveLength(3);
		expect(covered[0].classList.contains('anno-comment-start')).toBe(true);
		expect(covered[0].classList.contains('anno-comment-end')).toBe(false);
		expect(covered[1].classList.contains('anno-comment-start')).toBe(false);
		expect(covered[1].classList.contains('anno-comment-end')).toBe(false);
		expect(covered[2].classList.contains('anno-comment-start')).toBe(false);
		expect(covered[2].classList.contains('anno-comment-end')).toBe(true);
	});

	it('adds mark classes to covered node wrappers automatically', async () => {
		const session = create_annotation_session();
		create_mark(session, 'section', node_selection(0, 3));

		const { container } = render(SveditTest, { session });
		await tick();

		const covered = [...container.querySelectorAll('[data-type="node"].mark-section')];
		expect(covered).toHaveLength(3);
		expect(covered[0].classList.contains('mark-section-start')).toBe(true);
		expect(covered[0].classList.contains('mark-section-end')).toBe(false);
		expect(covered[2].classList.contains('mark-section-start')).toBe(false);
		expect(covered[2].classList.contains('mark-section-end')).toBe(true);
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
		'toggles $name marks with the same create/remove/create behavior',
		({ selection, value_path, first_type, second_type }) => {
			const session = create_annotation_session();
			session.selection = selection as any;

			session.apply(session.tr.toggle_mark(first_type));
			let value = session.get(value_path);
			expect(value.marks).toHaveLength(1);
			expect(range_type(session, value.marks[0])).toBe(first_type);
			expect(session.selection).toEqual(selection);
			expect_exclusive(value.marks);

			session.apply(session.tr.toggle_mark(second_type));
			value = session.get(value_path);
			expect(value.marks).toEqual([]);
			expect(session.selection).toEqual(selection);

			session.apply(session.tr.toggle_mark(second_type));
			value = session.get(value_path);
			expect(value.marks).toHaveLength(1);
			expect(range_type(session, value.marks[0])).toBe(second_type);
			expect(session.selection).toEqual(selection);
			expect_exclusive(value.marks);
		}
	);

	it('switches an overlapping text mark to another property-less mark type', () => {
		const session = create_annotation_session();
		session.selection = text_selection(0, 5);
		session.apply(session.tr.toggle_mark('strong'));

		session.selection = text_selection(3, 8);
		session.apply(session.tr.toggle_mark('emphasis'));
		const marks = session.get(title_path).marks;
		expect(marks).toHaveLength(1);
		expect(range_type(session, marks[0])).toBe('emphasis');
		expect(marks[0]).toMatchObject({ start_offset: 0, end_offset: 5 });
		expect(session.selection).toEqual(text_selection(0, 5));
		expect_exclusive(marks);
	});

	it('supports backward node selections and rejects collapsed selections', () => {
		const session = create_annotation_session();
		session.selection = node_selection(2, 0);
		session.apply(session.tr.toggle_mark('section'));
		expect(session.get(body_path).marks[0]).toMatchObject({
			start_offset: 0,
			end_offset: 2
		});

		session.selection = node_selection(2, 2);
		const before = structuredClone(session.doc);
		session.apply(session.tr.toggle_mark('section'));
		expect(session.doc).toEqual(before);
	});

	it.each([
		{
			name: 'text marks',
			key: 'marks',
			toggle: 'toggle_mark',
			selection: text_selection(2, 4),
			range_selection: text_selection(0, 5),
			value_path: title_path,
			type: 'strong',
			expected_end: 3
		},
		{
			name: 'node marks',
			key: 'marks',
			toggle: 'toggle_mark',
			selection: node_selection(1, 2),
			range_selection: node_selection(0, 3),
			value_path: body_path,
			type: 'section',
			expected_end: 2
		},
		{
			name: 'text annotations',
			key: 'annotations',
			toggle: 'toggle_annotation',
			selection: text_selection(2, 4),
			range_selection: text_selection(0, 5),
			value_path: title_path,
			type: 'comment',
			expected_end: 3
		},
		{
			name: 'node annotations',
			key: 'annotations',
			toggle: 'toggle_annotation',
			selection: node_selection(1, 2),
			range_selection: node_selection(0, 3),
			value_path: body_path,
			type: 'comment',
			expected_end: 2
		}
	])(
		'uses the same range transfer semantics when deleting $name',
		({ key, toggle, selection, range_selection, value_path, type, expected_end }) => {
			const session = create_annotation_session();
			session.selection = range_selection as any;
			session.apply(session.tr[toggle](type));

			session.selection = selection as any;
			session.apply(session.tr.delete_selection());

			const ranges = session.get(value_path)[key];
			expect(ranges).toHaveLength(1);
			expect(ranges[0]).toMatchObject({
				start_offset: 0,
				end_offset: expected_end
			});
		}
	);

	it('extends node marks for insertion inside, but not at their edges', () => {
		const session = create_annotation_session();
		session.selection = node_selection(0, 2);
		session.apply(session.tr.toggle_mark('section'));

		const inside = session.tr;
		inside.set_selection(node_selection(1, 1));
		inside.create({
			id: 'inside_paragraph',
			type: 'paragraph',
			content: { content: 'inside', marks: [], annotations: [] }
		});
		inside.insert_nodes(['inside_paragraph']);
		session.apply(inside);
		expect(session.get(body_path).marks[0]).toMatchObject({
			start_offset: 0,
			end_offset: 3
		});

		const edge = session.tr;
		edge.set_selection(node_selection(3, 3));
		edge.create({
			id: 'edge_paragraph',
			type: 'paragraph',
			content: { content: 'edge', marks: [], annotations: [] }
		});
		edge.insert_nodes(['edge_paragraph']);
		session.apply(edge);
		const marks = session.get(body_path).marks;
		expect(marks[0]).toMatchObject({ start_offset: 0, end_offset: 3 });
		expect_exclusive(marks);
	});

	it('uses the same insertion transfer semantics for marked text', () => {
		const session = create_annotation_session();
		session.selection = text_selection(0, 5);
		session.apply(session.tr.toggle_mark('strong'));

		session.selection = text_selection(2, 2);
		session.apply(session.tr.insert_text('X'));
		let marks = session.get(title_path).marks;
		expect(marks[0]).toMatchObject({ start_offset: 0, end_offset: 6 });

		session.selection = text_selection(6, 6);
		session.apply(session.tr.insert_text('Y'));
		marks = session.get(title_path).marks;
		expect(marks[0]).toMatchObject({ start_offset: 0, end_offset: 6 });
		expect_exclusive(marks);
	});

	it.each([
		{
			name: 'text marks',
			key: 'marks',
			toggle: 'toggle_mark',
			selection: text_selection(0, 5),
			value_path: title_path,
			type: 'strong'
		},
		{
			name: 'node marks',
			key: 'marks',
			toggle: 'toggle_mark',
			selection: node_selection(0, 2),
			value_path: body_path,
			type: 'section'
		},
		{
			name: 'text annotations',
			key: 'annotations',
			toggle: 'toggle_annotation',
			selection: text_selection(0, 5),
			value_path: title_path,
			type: 'comment'
		},
		{
			name: 'node annotations',
			key: 'annotations',
			toggle: 'toggle_annotation',
			selection: node_selection(0, 2),
			value_path: body_path,
			type: 'comment'
		}
	])(
		'removes fully deleted $name and their nodes',
		({ key, toggle, selection, value_path, type }) => {
			const session = create_annotation_session();
			session.selection = selection as any;
			session.apply(session.tr[toggle](type));
			const range_node_id = session.get(value_path)[key][0].node_id;

			session.selection = selection as any;
			session.apply(session.tr.delete_selection());

			expect(session.get(value_path)[key]).toEqual([]);
			expect(session.get(range_node_id)).toBeUndefined();
		}
	);

	it('preserves clipped node-array marks and annotations across cut and paste', () => {
		const session = create_annotation_session();
		session.selection = node_selection(0, 2);
		session.apply(session.tr.toggle_mark('section'));
		session.selection = node_selection(0, 2);
		session.apply(session.tr.toggle_annotation('comment'));

		session.selection = node_selection(1, 2);
		const payload = session.get_selected_annotated_nodes();
		expect(payload.marks).toEqual([
			{ start_offset: 0, end_offset: 1, node_id: expect.any(String) }
		]);
		expect(payload.annotations).toEqual([
			{ start_offset: 0, end_offset: 1, node_id: expect.any(String) }
		]);

		session.apply(session.tr.delete_selection());
		let body = session.get(body_path);
		expect(body.marks[0]).toMatchObject({ start_offset: 0, end_offset: 1 });
		expect(body.annotations[0]).toMatchObject({ start_offset: 0, end_offset: 1 });

		const tr = session.tr;
		tr.set_selection(node_selection(body.nodes.length, body.nodes.length));
		const pasted_node_ids = payload.main_nodes.map((node_id) => tr.build(node_id, payload.nodes));
		tr.insert_nodes(pasted_node_ids, payload.marks, payload.annotations, payload.nodes);
		session.apply(tr);

		body = session.get(body_path);
		expect(body.marks).toHaveLength(2);
		expect(body.marks[1]).toMatchObject({
			start_offset: body.nodes.length - 1,
			end_offset: body.nodes.length
		});
		expect(range_type(session, body.marks[1])).toBe('section');
		expect_exclusive(body.marks);
		expect(body.annotations).toHaveLength(2);
		expect(body.annotations[1]).toMatchObject({
			start_offset: body.nodes.length - 1,
			end_offset: body.nodes.length
		});
		expect(range_type(session, body.annotations[1])).toBe('comment');
	});

	it('never restores pasted marks over an existing node mark', () => {
		const session = create_annotation_session();
		session.selection = node_selection(0, 1);
		session.apply(session.tr.toggle_mark('section'));
		const payload = session.get_selected_annotated_nodes();

		const tr = session.tr;
		tr.set_selection(node_selection(0, 0));
		const pasted_node_ids = payload.main_nodes.map((node_id) => tr.build(node_id, payload.nodes));
		tr.insert_nodes(pasted_node_ids, payload.marks, payload.annotations, payload.nodes);
		session.apply(tr);

		const marks = session.get(body_path).marks;
		expect(marks).toHaveLength(1);
		expect_exclusive(marks);
	});

	it('rejects overlapping marks from a node clipboard payload', () => {
		const session = create_annotation_session();
		session.selection = node_selection(0, 1);
		session.apply(session.tr.toggle_mark('section'));
		const payload = session.get_selected_annotated_nodes();

		const tr = session.tr;
		tr.set_selection(node_selection(3, 3));
		const pasted_node_ids = payload.main_nodes.map((node_id) => tr.build(node_id, payload.nodes));
		tr.insert_nodes(
			pasted_node_ids,
			[payload.marks[0], { ...payload.marks[0] }],
			[],
			payload.nodes
		);
		session.apply(tr);

		const marks = session.get(body_path).marks;
		expect(marks).toHaveLength(1);
		expect_exclusive(marks);
	});

	it('rejects overlapping node-array marks at transaction validation', () => {
		const session = create_annotation_session();
		const tr = session.tr;
		tr.create({ id: 'section_a', type: 'section' });
		tr.create({ id: 'section_b', type: 'section' });
		const body = structuredClone(tr.get(body_path));
		body.marks = [
			{ start_offset: 0, end_offset: 2, node_id: 'section_a' },
			{ start_offset: 1, end_offset: 3, node_id: 'section_b' }
		];
		tr.set(body_path, body);

		expect(() => session.apply(tr)).toThrow('overlapping marks');
	});

	it('transfers node-array marks through the actual cut and paste handlers', async () => {
		const session = create_annotation_session();
		const { container } = render(SveditTest, { session });
		const canvas = container.querySelector('.svedit-canvas') as HTMLElement;
		canvas.focus();

		session.selection = node_selection(0, 1);
		session.apply(session.tr.toggle_mark('section'));
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

		let body = session.get(body_path);
		expect(body.nodes).toHaveLength(2);
		expect(body.marks).toEqual([]);

		session.selection = node_selection(body.nodes.length, body.nodes.length);
		const paste_event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(paste_event, 'clipboardData', { value: clipboard_data });
		document.dispatchEvent(paste_event);
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 10));

		body = session.get(body_path);
		expect(body.nodes).toHaveLength(3);
		expect(body.marks).toHaveLength(1);
		expect(body.marks[0]).toMatchObject({ start_offset: 2, end_offset: 3 });
		expect(range_type(session, body.marks[0])).toBe('section');
		expect_exclusive(body.marks);
	});
});
