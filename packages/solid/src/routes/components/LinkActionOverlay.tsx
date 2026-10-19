import { Show, createMemo } from 'solid-js';
import Icon from './Icon.js';
import { serialize_path } from '@svedit/solid';
import type { DocumentPath } from '@svedit/solid';
import { use_app_svedit } from '../svedit_context.js';
import { consume_link_autofocus } from '@svedit/demo-shared/src/link_autofocus.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './LinkActionOverlay.css';

export default function LinkActionOverlay() {
	const svedit = use_app_svedit();

	const active_link_path = createMemo(() => get_active_link_path());
	const active_link = createMemo<Nodes['link'] | null>(() =>
		active_link_path() ? svedit.session.get(active_link_path()) : null
	);
	const committed_href = createMemo(() => active_link()?.href ?? '');

	function get_active_link_path(): DocumentPath | null {
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return null;

		const active_mark = svedit.session.active_mark;
		if (active_mark?.node.type === 'link') {
			return [...sel.path, 'marks', active_mark.index, 'node_id'];
		}
		return null;
	}

	// Anchor to the text property owning the selection — the same anchor the
	// floating toolbar uses — so toggling a link morphs the toolbar into this
	// popover at the exact same position and size.
	const anchor_name = createMemo(() => {
		const sel = svedit.session.selection;
		return sel?.type === 'text' ? serialize_path(sel.path) : null;
	});

	// One set per edit session: unchanged values are skipped so Enter
	// followed by the change event on blur doesn't apply twice.
	function commit_href(value: string) {
		const link = active_link();
		if (!link || value === committed_href()) return;
		const session = svedit.session;
		const tr = session.tr;
		tr.set([link.id, 'href'], value);
		session.apply(tr);
	}

	function handle_keydown(event: KeyboardEvent) {
		if (!(event.target instanceof HTMLInputElement)) return;
		if (event.key === 'Enter') {
			commit_href(event.target.value);
			event.preventDefault();
			event.stopPropagation();
			svedit.focus_canvas();
		} else if (event.key === 'Escape') {
			// Revert the field before focus returns to the canvas, so the
			// change event fired on blur doesn't commit the discarded text.
			// A link that is still empty is removed again: Escape cancels
			// the whole link creation.
			event.target.value = committed_href();
			if (committed_href() === '') {
				const session = svedit.session;
				session.apply(session.tr.toggle_mark('link'));
			}
			event.preventDefault();
			event.stopPropagation();
			svedit.focus_canvas();
		}
	}

	// Focus only when the popover just appeared for a link freshly created
	// from the toolbar (explicit one-shot signal); preventScroll stops the
	// browser from scrolling towards the focused input.
	//
	// The focus is deferred with a zero-delay timeout: the ref callback runs
	// while Solid creates the element, and focusing during the update fires
	// the canvas blur synchronously while Svedit's selection effect would
	// still see the canvas as focused and steal focus right back via
	// setBaseAndExtent. Deferring makes this the same code path as a manual
	// click into the input, which is already handled.
	function focus_on_create(input: HTMLInputElement) {
		if (!consume_link_autofocus()) return;
		setTimeout(() => {
			if (input.isConnected) input.focus({ preventScroll: true });
		}, 0);
	}

	function open_link(event: MouseEvent) {
		event.preventDefault();
		const href = active_link()?.href;
		if (href) window.open(href, '_blank', 'noopener');
	}

	function remove_link(event: MouseEvent) {
		event.preventDefault();
		const session = svedit.session;
		session.apply(session.tr.toggle_mark('link'));
	}

	return (
		<Show when={active_link_path() && anchor_name()}>
			<div
				class="link-popover"
				style={`position-anchor: --${anchor_name()};`}
				onKeyDown={handle_keydown}
			>
				<input
					ref={focus_on_create}
					class="url-field"
					type="url"
					value={committed_href()}
					placeholder="Enter link URL"
					aria-label="Link URL"
					onChange={(event) => commit_href(event.currentTarget.value)}
				/>
				{/* Disabled while the field is empty — a valid href can be as short
				    as "/" or "#id", so emptiness is the only check we can make. */}
				<button title="Open in new tab" disabled={committed_href() === ''} onMouseDown={open_link}>
					<Icon name="external-link" />
				</button>
				<button title="Remove link" onMouseDown={remove_link}>
					<Icon name="backspace-delete" />
				</button>
			</div>
		</Show>
	);
}
