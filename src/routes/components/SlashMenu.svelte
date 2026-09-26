<script lang="ts">
	import { getContext } from 'svelte';
	import { define_keymap, type KeyMapper } from 'svedit';
	import { serialize_path } from '../../lib/utils.js';
	import { get_svedit_context } from '../svedit_context.js';
	import { get_slash_trigger, type SlashTrigger } from '../slash_trigger.js';
	import { mention_user_ids } from '../mention_directory.js';

	const svedit = get_svedit_context();
	// The app owns the KeyMapper (see +page.svelte), so an overlay can push its
	// own scope while it is open instead of racing Svedit's keydown handling.
	const key_mapper = getContext<KeyMapper>('key_mapper');

	/** Starting data for each inline node type the demo offers. */
	const default_properties: Record<string, Record<string, unknown>> = {
		mention: { user_id: mention_user_ids[0] }
	};

	const labels: Record<string, string> = {
		mention: 'Mention'
	};

	// Escape closes the menu without touching the text, so remember which
	// trigger was dismissed. Typing a new '/' elsewhere opens it again.
	let dismissed_start: number | null = $state(null);
	let selected_index = $state(0);

	let trigger: SlashTrigger | null = $derived.by(() => {
		if (!svedit.editable) return null;
		const selection = svedit.session.selection;
		if (selection?.type !== 'text') return null;
		if (selection.anchor_offset !== selection.focus_offset) return null;
		if (svedit.session.available_inline_types.length === 0) return null;
		// Never offer an insert the transaction would refuse (e.g. inside a mark).
		if (!svedit.session.can_insert_inline_node) return null;

		const found = get_slash_trigger(
			svedit.session.get(selection.path).content,
			selection.focus_offset
		);
		if (found && found.start_offset === dismissed_start) return null;
		return found;
	});

	let items = $derived.by(() => {
		if (!trigger) return [];
		const query = trigger.query.toLowerCase();
		return svedit.session.available_inline_types.filter((type) =>
			(labels[type] ?? type).toLowerCase().includes(query)
		);
	});

	let is_open = $derived(Boolean(trigger) && items.length > 0);

	// Reset the highlight whenever the query changes, so it never points past
	// the end of a shorter filtered list.
	$effect(() => {
		trigger?.query;
		selected_index = 0;
	});

	let caret_rect: { top: number; left: number; bottom: number } | null = $state(null);

	function measure() {
		const selection = svedit.session.selection;
		if (selection?.type !== 'text') return;

		// Svedit anchors overlays to properties and nodes, but there is no
		// anchor for the caret itself, so measure the DOM selection directly.
		const dom_selection = window.getSelection();
		let rect: DOMRect | null = null;
		if (dom_selection?.rangeCount) {
			const measured = dom_selection.getRangeAt(0).getBoundingClientRect();
			// A collapsed caret has zero width but a real height, so size is what
			// distinguishes a usable rect from "nothing rendered to measure yet".
			if (measured.width > 0 || measured.height > 0) rect = measured;
		}
		if (!rect) {
			// Fall back to the text property's own box, so a menu that cannot be
			// placed at the caret still appears rather than silently vanishing.
			const text_el = document.querySelector(
				`[data-path="${serialize_path(selection.path)}"][data-type="text"]`
			);
			rect = text_el?.getBoundingClientRect() ?? null;
		}
		caret_rect = rect ? { top: rect.top, left: rect.left, bottom: rect.bottom } : null;
	}

	$effect(() => {
		if (!is_open) {
			caret_rect = null;
			return;
		}
		// Re-read as the query grows so the menu tracks the caret.
		trigger?.query;
		measure();

		// Svedit renders the DOM selection from its own effect, which can run
		// after this one. Measuring only here would pin the menu to wherever the
		// caret was beforehand, so re-measure once the selection actually lands.
		document.addEventListener('selectionchange', measure);
		return () => document.removeEventListener('selectionchange', measure);
	});

	const menu_keymap = define_keymap({
		arrowdown: [
			{
				is_enabled: () => is_open,
				execute: () => {
					selected_index = (selected_index + 1) % items.length;
				}
			}
		],
		arrowup: [
			{
				is_enabled: () => is_open,
				execute: () => {
					selected_index = (selected_index - 1 + items.length) % items.length;
				}
			}
		],
		enter: [
			{
				is_enabled: () => is_open,
				execute: () => insert(items[selected_index])
			}
		],
		escape: [
			{
				is_enabled: () => is_open,
				execute: () => {
					dismissed_start = trigger?.start_offset ?? null;
				}
			}
		]
	});

	$effect(() => {
		if (!is_open) return;
		key_mapper?.push_scope(menu_keymap);
		return () => key_mapper?.pop_scope();
	});

	function insert(inline_type: string) {
		const selection = svedit.session.selection;
		if (!trigger || selection?.type !== 'text') return;

		const session = svedit.session;
		const tr = session.tr;
		// Select the "/query" the user typed. insert_inline_node deletes a
		// non-collapsed selection before inserting, so the trigger text is
		// consumed by the same call.
		tr.set_selection({
			type: 'text',
			path: selection.path,
			anchor_offset: trigger.start_offset,
			focus_offset: selection.focus_offset
		});
		tr.insert_inline_node(inline_type, default_properties[inline_type] ?? {});
		session.apply(tr);
		dismissed_start = null;
		svedit.focus_canvas();
	}
</script>

{#if is_open && caret_rect}
	<div class="slash-menu" style="top: {caret_rect.bottom}px; left: {caret_rect.left}px;">
		{#each items as inline_type, index (inline_type)}
			<button
				class:active={index === selected_index}
				onmousedown={(event) => {
					// Keep the canvas focused so the selection survives the click.
					event.preventDefault();
					insert(inline_type);
				}}
			>
				{labels[inline_type] ?? inline_type}
			</button>
		{/each}
	</div>
{/if}

<style>
	.slash-menu {
		position: fixed;
		z-index: 60;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 140px;
		margin-top: var(--s-1);
		padding: 4px;
		background: var(--app-canvas-fill);
		border: 1px solid oklch(from var(--app-primary-text) l c h / 0.12);
		border-radius: var(--s-2);
		box-shadow:
			0 1px 2px oklch(0% 0 0 / 0.12),
			0 4px 16px oklch(0% 0 0 / 0.08);
		pointer-events: auto;
	}

	.slash-menu button {
		padding: var(--s-1) var(--s-2);
		border: none;
		border-radius: var(--s-1);
		background: transparent;
		color: var(--app-primary-text);
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}

	.slash-menu button.active {
		background: oklch(from var(--app-primary-text) l c h / 0.09);
	}
</style>
