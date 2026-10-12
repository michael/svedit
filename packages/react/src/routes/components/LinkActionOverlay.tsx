import { useEffect, useRef } from 'react';
import Icon from './Icon.js';
import { serialize_path, useSvedit, shallow_equal } from '@svedit/react';
import type { DocumentPath } from '@svedit/react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ChangeEvent } from 'react';
import { useAppSvedit } from '../svedit_context.js';
import { consume_link_autofocus } from '@svedit/demo-shared/src/link_autofocus.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './LinkActionOverlay.css';

/**
 * Focus only when the popover just appeared for a link freshly created
 * from the toolbar (explicit one-shot signal); preventScroll stops the
 * browser from scrolling towards the focused input.
 *
 * The focus is deferred with a zero-delay timeout: the effect runs
 * inside React's commit, and focusing there fires the canvas blur
 * synchronously while Svedit's selection effect would still see the
 * canvas as focused and steal focus right back via setBaseAndExtent.
 * Deferring makes this the same code path as a manual click into
 * the input, which is already handled.
 */
function UrlField({
	committed_href,
	on_commit
}: {
	committed_href: string;
	on_commit: (value: string) => void;
}) {
	const input_ref = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const input = input_ref.current;
		if (!input || !consume_link_autofocus()) return;
		setTimeout(() => {
			if (input.isConnected) input.focus({ preventScroll: true });
		}, 0);
	}, []);

	return (
		<input
			ref={input_ref}
			className="url-field"
			type="url"
			// Uncontrolled: the committed value is the initial value; the
			// field is keyed by link path by the parent so it re-mounts per link.
			defaultValue={committed_href}
			placeholder="Enter link URL"
			aria-label="Link URL"
			onChange={(event: ChangeEvent<HTMLInputElement>) => void event}
			onBlur={(event) => on_commit(event.currentTarget.value)}
		/>
	);
}

export default function LinkActionOverlay() {
	const svedit = useAppSvedit();

	const { active_link_path, active_link, anchor_name } = useSvedit((context) => {
		const session = context.session;
		const sel = session.selection;
		let active_link_path: DocumentPath | null = null;
		if (sel && sel.type === 'text') {
			const active_mark = session.active_mark;
			if (active_mark?.node.type === 'link') {
				active_link_path = [...sel.path, 'marks', active_mark.index, 'node_id'];
			}
		}
		const active_link: Nodes['link'] | null = active_link_path
			? session.get(active_link_path)
			: null;
		// Anchor to the text property owning the selection — the same anchor the
		// floating toolbar uses — so toggling a link morphs the toolbar into this
		// popover at the exact same position and size.
		const anchor_name = sel?.type === 'text' ? serialize_path(sel.path) : null;
		return { active_link_path, active_link, anchor_name };
	}, shallow_equal);

	const committed_href = active_link?.href ?? '';

	// One set per edit session: unchanged values are skipped so Enter
	// followed by the change event on blur doesn't apply twice.
	function commit_href(value: string) {
		if (!active_link || value === committed_href) return;
		const session = svedit.session;
		const tr = session.tr;
		tr.set([active_link.id, 'href'], value);
		session.apply(tr);
	}

	function handle_keydown(event: KeyboardEvent<HTMLDivElement>) {
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
			event.target.value = committed_href;
			if (committed_href === '') {
				const session = svedit.session;
				session.apply(session.tr.toggle_mark('link'));
			}
			event.preventDefault();
			event.stopPropagation();
			svedit.focus_canvas();
		}
	}

	function open_link(event: MouseEvent) {
		event.preventDefault();
		if (active_link?.href) window.open(active_link.href, '_blank', 'noopener');
	}

	function remove_link(event: MouseEvent) {
		event.preventDefault();
		const session = svedit.session;
		session.apply(session.tr.toggle_mark('link'));
	}

	if (!active_link_path || !anchor_name) return null;

	return (
		<div
			className="link-popover"
			style={{ positionAnchor: `--${anchor_name}` } as CSSProperties}
			onKeyDown={handle_keydown}
		>
			<UrlField
				key={`${serialize_path(active_link_path)}:${committed_href}`}
				committed_href={committed_href}
				on_commit={commit_href}
			/>
			{/* Disabled while the field is empty — a valid href can be as short
			    as "/" or "#id", so emptiness is the only check we can make. */}
			<button title="Open in new tab" disabled={committed_href === ''} onMouseDown={open_link}>
				<Icon name="external-link" />
			</button>
			<button title="Remove link" onMouseDown={remove_link}>
				<Icon name="backspace-delete" />
			</button>
		</div>
	);
}
