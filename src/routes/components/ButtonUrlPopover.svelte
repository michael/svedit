<script>
	import { resolve } from '$app/paths';
	import { getContext } from 'svelte';
	import { serialize_path } from '../../lib/utils.js';

	const svedit = getContext('svedit');
	const dialog_id = 'button-url-dialog';
	const input_id = 'button-url-input';

	let href_input_value = $state('');
	let show_editor = $state(false);
	let editing_target_path_str = $state('');

	let target_path = $derived(get_target_path());
	let target_path_str = $derived(target_path ? serialize_path(target_path) : '');
	let target_node = $derived(target_path ? svedit.session.get(target_path) : null);
	let has_target = $derived(Boolean(target_node && typeof target_node.href === 'string'));
	let is_editing_current_target = $derived(
		has_target && show_editor && target_path_str === editing_target_path_str
	);

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

	function open_editor(event) {
		event.preventDefault();
		href_input_value = target_node?.href || '';
		editing_target_path_str = target_path_str;
		show_editor = true;

		const dialog_el = /** @type {HTMLDialogElement | null} */ (document.getElementById(dialog_id));
		if (dialog_el && !dialog_el.open) dialog_el.showModal();

		const input_el = /** @type {HTMLInputElement | null} */ (document.getElementById(input_id));
		input_el?.focus();
		input_el?.select();
	}

	function save() {
		if (target_node && typeof target_node.href === 'string') {
			const tr = svedit.session.tr;
			tr.set([target_node.id, 'href'], href_input_value);
			svedit.session.apply(tr);
		}
		close_editor();
	}

	function close_editor() {
		const dialog_el = /** @type {HTMLDialogElement | null} */ (document.getElementById(dialog_id));
		if (dialog_el?.open) dialog_el.close();

		show_editor = false;
		editing_target_path_str = '';
		svedit.focus_canvas();
	}

	function handle_keydown(event) {
		event.stopPropagation();

		if (event.key === 'Enter') {
			event.preventDefault();
			save();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			close_editor();
		}
	}

	function handle_backdrop_click(event) {
		if (event.target === event.currentTarget) {
			close_editor();
		}
	}

	function get_preview_href(href) {
		if (!href) return '';
		return href.startsWith('/') ? resolve(href) : href;
	}

	function handle_cancel(event) {
		event.preventDefault();
		close_editor();
	}
</script>

{#if has_target}
	{#if !is_editing_current_target}
		<div class="button-url-preview" style="position-anchor: --{target_path_str};">
			<a {...{ href: get_preview_href(target_node.href), target: '_blank', rel: 'noreferrer' }} class="url-preview-link">
				{target_node.href || 'No URL'}
			</a>
			<button type="button" onclick={open_editor}>Edit</button>
		</div>
	{/if}

	<dialog
		id={dialog_id}
		class="button-url-dialog"
		style="position-anchor: --{target_path_str};"
		onclick={handle_backdrop_click}
		oncancel={handle_cancel}
	>
		<div class="dialog-content">
			<div class="input-row">
				<input
					id={input_id}
					type="url"
					bind:value={href_input_value}
					placeholder="https://example.com"
					class="url-input"
					onkeydown={handle_keydown}
				/>
			</div>
			<div class="actions-row">
				<button type="button" onclick={save}>Update</button>
			</div>
		</div>
	</dialog>
{/if}

<style>
	.button-url-preview {
		--popover-edge-gap: var(--s-4);
		--popover-width: min(420px, calc(100vw - 2 * var(--popover-edge-gap)));
		position: absolute;
		position-visibility: anchors-visible;
		top: anchor(bottom);
		left: clamp(
			calc(var(--popover-width) * 0.5 + var(--popover-edge-gap)),
			anchor(center),
			calc(100vw - var(--popover-width) * 0.5 - var(--popover-edge-gap))
		);
		z-index: 40;
		display: flex;
		align-items: stretch;
		width: var(--popover-width);
		background: var(--app-canvas-fill);
		border: 1px solid color-mix(in oklch, var(--app-canvas-fill) 84%, var(--app-primary-text));
		box-shadow: var(--shadow-2);
		color: var(--app-primary-text);
		pointer-events: auto;
		transform: translate(-50%, var(--s-1));
	}

	.url-preview-link {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: var(--s-2) var(--s-3);
		color: var(--app-primary-text);
		font-size: 14px;
		text-decoration: none;
	}

	.url-preview-link:hover {
		text-decoration: underline;
	}

	.button-url-preview button,
	.actions-row button {
		flex: 0 0 auto;
		padding: 0 var(--s-3);
		border: 0;
		border-left: 1px solid color-mix(in oklch, var(--app-canvas-fill) 84%, var(--app-primary-text));
		background: var(--app-canvas-fill);
		color: var(--svedit-editing-stroke);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.button-url-preview button:hover,
	.button-url-preview button:focus-visible,
	.actions-row button:hover,
	.actions-row button:focus-visible {
		background: color-mix(in oklch, var(--app-canvas-fill) 96%, var(--app-primary-text));
		outline: none;
	}

	.button-url-dialog {
		--popover-edge-gap: var(--s-4);
		--popover-width: min(360px, calc(100vw - 2 * var(--popover-edge-gap)));
		position: absolute;
		position-visibility: anchors-visible;
		top: anchor(bottom);
		left: clamp(
			calc(var(--popover-width) * 0.5 + var(--popover-edge-gap)),
			anchor(center),
			calc(100vw - var(--popover-width) * 0.5 - var(--popover-edge-gap))
		);
		z-index: 50;
		width: var(--popover-width);
		max-height: 90vh;
		margin: 0;
		padding: 0;
		overflow: visible;
		background: var(--app-canvas-fill);
		border: 1px solid color-mix(in oklch, var(--app-canvas-fill) 84%, var(--app-primary-text));
		box-shadow: var(--shadow-2);
		color: var(--app-primary-text);
		transform: translate(-50%, var(--s-1));
	}

	.dialog-content {
		display: flex;
		flex-direction: column;
	}

	.input-row {
		padding: var(--s-1) var(--s-1) 0;
	}

	.url-input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
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

	.actions-row {
		display: flex;
		justify-content: flex-end;
		padding: var(--s-2) var(--s-3);
	}

	.actions-row button {
		border-left: 0;
		padding-block: var(--s-1);
	}

	.button-url-dialog::backdrop {
		background: color-mix(in oklch, var(--app-primary-text) 10%, transparent);
	}
</style>
