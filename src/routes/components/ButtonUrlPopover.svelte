<script>
	import { getContext } from 'svelte';
	import { serialize_path } from '../../lib/utils.js';

	const svedit = getContext('svedit');

	let target_path = $derived(get_target_path());
	let target_path_str = $derived(target_path ? serialize_path(target_path) : '');
	let target_node = $derived(target_path ? svedit.session.get(target_path) : null);
	let has_target = $derived(Boolean(target_node && typeof target_node.href === 'string'));

	function get_target_path() {
		const selection = svedit.session.selection;
		if (!selection) return null;

		if (selection.type === 'node') {
			const start = Math.min(selection.anchor_offset, selection.focus_offset);
			const end = Math.max(selection.anchor_offset, selection.focus_offset);
			if (end - start !== 1) return null;
			return [...selection.path, start];
		}

		if (selection.type === 'text' || selection.type === 'property') {
			return selection.path.slice(0, -1);
		}

		return null;
	}

	function save(href) {
		if (!has_target) return;

		const tr = svedit.session.tr;
		tr.set([target_node.id, 'href'], href);
		svedit.session.apply(tr);
		svedit.focus_canvas();
	}

	function handle_submit(event) {
		event.preventDefault();

		const form_data = new FormData(event.currentTarget);
		const href = form_data.get('href')?.toString() || '';
		save(href);
	}

	function handle_keydown(event) {
		event.stopPropagation();

		if (event.key === 'Escape') {
			event.preventDefault();
			svedit.focus_canvas();
		}
	}
</script>

{#if has_target}
	{#key target_path_str}
		<form
			class="button-url-popover"
			style="position-anchor: --{target_path_str};"
			onsubmit={handle_submit}
		>
			<input
				name="href"
				type="url"
				value={target_node.href || ''}
				placeholder="https://example.com"
				class="url-input"
				onkeydown={handle_keydown}
			/>
			<button type="submit">Update</button>
		</form>
	{/key}
{/if}

<style>
	.button-url-popover {
		position: absolute;
		position-visibility: anchors-visible;
		top: anchor(bottom);
		left: anchor(center);
		z-index: 40;
		display: flex;
		align-items: stretch;
		width: min(360px, calc(100vw - 2 * var(--s-4)));
		padding: var(--s-1);
		background: var(--app-canvas-fill);
		border: 1px solid color-mix(in oklch, var(--app-canvas-fill) 84%, var(--app-primary-text));
		box-shadow: var(--shadow-2);
		color: var(--app-primary-text);
		pointer-events: auto;
		transform: translate(-50%, var(--s-1));
	}

	.url-input {
		min-width: 0;
		flex: 1 1 auto;
		padding: var(--s-2) var(--s-3);
		border: 1px solid color-mix(in oklch, var(--app-canvas-fill) 84%, var(--app-primary-text));
		background: var(--app-canvas-fill);
		color: var(--app-primary-text);
		font-size: 16px;
	}

	.url-input:focus {
		border-color: var(--svedit-editing-stroke);
		outline: none;
	}

	.button-url-popover button {
		flex: 0 0 auto;
		padding: 0 var(--s-3);
		border: 1px solid var(--svedit-editing-stroke);
		border-left: 0;
		background: var(--app-canvas-fill);
		color: var(--svedit-editing-stroke);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.button-url-popover button:hover,
	.button-url-popover button:focus-visible {
		background: color-mix(in oklch, var(--app-canvas-fill) 96%, var(--app-primary-text));
		outline: none;
	}
</style>
