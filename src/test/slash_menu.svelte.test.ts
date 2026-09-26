import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import create_inline_session from './create_inline_session.js';
import SveditTestWithKeymap from './testing_components/SveditTestWithKeymap.svelte';
import SlashMenu from '../routes/components/SlashMenu.svelte';
import { INLINE_NODE_PLACEHOLDER } from '../lib/utils.js';

const rendered_path = ['page_1', 'body', 0, 'description'];

/** A session whose overlays render the slash menu, as the demo does. */
function create_menu_session() {
	const session = create_inline_session();
	session.config = { ...session.config, system_components: { overlays: SlashMenu } };
	return session;
}

async function type_at(session: any, text: string, offset: number) {
	session.selection = {
		type: 'text',
		path: rendered_path,
		anchor_offset: offset,
		focus_offset: offset
	};
	session.apply(session.tr.insert_text(text));
	await tick();
}

describe('slash menu', () => {
	it('opens when a slash is typed and lists the available inline types', async () => {
		const session = create_menu_session();
		const { container } = render(SveditTestWithKeymap, { session });
		await tick();

		expect(container.querySelector('.slash-menu')).toBeNull();

		await type_at(session, ' /', 5);

		const menu = container.querySelector('.slash-menu');
		expect(menu).not.toBeNull();
		expect(menu!.textContent).toContain('Mention');
	});

	it('stays closed inside a URL', async () => {
		const session = create_menu_session();
		const { container } = render(SveditTestWithKeymap, { session });
		await tick();

		await type_at(session, 'https://', 5);

		expect(container.querySelector('.slash-menu')).toBeNull();
	});

	it('stays closed where an inline node cannot be inserted', async () => {
		const session = create_menu_session();
		const { container } = render(SveditTestWithKeymap, { session });
		await tick();

		// Bold a run, then type the trigger inside it. The transaction would
		// refuse the insert here, so the menu must not offer it.
		session.selection = {
			type: 'text',
			path: rendered_path,
			anchor_offset: 0,
			focus_offset: 10
		};
		session.apply(session.tr.toggle_mark('strong'));
		await type_at(session, ' /', 4);

		expect(container.querySelector('.slash-menu')).toBeNull();
	});

	it('replaces the typed trigger with an inline node when an item is chosen', async () => {
		const session = create_menu_session();
		const { container } = render(SveditTestWithKeymap, { session });
		await tick();

		await type_at(session, ' /men', 5);
		const item = container.querySelector<HTMLButtonElement>('.slash-menu button');
		expect(item).not.toBeNull();

		item!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		await tick();

		const value = session.get(rendered_path);
		// The '/men' the user typed is consumed by the same call that inserts.
		expect(value.content).not.toContain('/men');
		expect(value.content).toContain(INLINE_NODE_PLACEHOLDER);
		expect(value.marks).toHaveLength(1);
		expect(session.get(value.marks[0].node_id).type).toBe('mention');
		expect(container.querySelector('.slash-menu')).toBeNull();
	});
});

describe('slash menu positioning', () => {
	it('positions the menu at the caret, not at the start of the property', async () => {
		const session = create_menu_session();
		const { container } = render(SveditTestWithKeymap, { session });
		await tick();
		const canvas = container.querySelector<HTMLElement>('.svedit-canvas')!;
		canvas.focus();
		// The test window never holds OS focus, so Chrome does not deliver the
		// focus event; dispatch it so the DOM selection is rendered.
		canvas.dispatchEvent(new FocusEvent('focus'));
		await tick();

		await type_at(session, ' /', 5);
		await new Promise((resolve) => setTimeout(resolve, 20));

		const menu = container.querySelector<HTMLElement>('.slash-menu');
		expect(menu).not.toBeNull();

		const dom_selection = window.getSelection()!;
		expect(dom_selection.rangeCount).toBe(1);
		const caret_rect = dom_selection.getRangeAt(0).getBoundingClientRect();
		const text_rect = container
			.querySelector<HTMLElement>('[data-type="text"][data-path="page_1__body__0__description"]')!
			.getBoundingClientRect();

		// The caret is indented into the line, so the property's left edge and
		// the caret are clearly distinguishable positions.
		expect(caret_rect.left - text_rect.left).toBeGreaterThan(8);

		const menu_rect = menu!.getBoundingClientRect();
		expect(Math.abs(menu_rect.left - caret_rect.left)).toBeLessThan(4);
	});
});
