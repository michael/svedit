<script setup lang="ts">
import { computed } from 'vue';
import type { Directive } from 'vue';
import Icon from './Icon.vue';
import { serialize_path } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import { consume_link_autofocus } from '@svedit/demo-shared/src/link_autofocus.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

const svedit = get_svedit_context();

const active_link_path = computed(() => get_active_link_path());
const active_link = computed<Nodes['link'] | null>(() =>
	active_link_path.value ? svedit.session.get(active_link_path.value) : null
);
const committed_href = computed(() => active_link.value?.href ?? '');

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
const anchor_name = computed(() =>
	svedit.session.selection?.type === 'text' ? serialize_path(svedit.session.selection.path) : null
);

// One set per edit session: unchanged values are skipped so Enter
// followed by the change event on blur doesn't apply twice.
function commit_href(value: string) {
	if (!active_link.value || value === committed_href.value) return;
	const session = svedit.session;
	const tr = session.tr;
	tr.set([active_link.value.id, 'href'], value);
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
		event.target.value = committed_href.value;
		if (committed_href.value === '') {
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
// The focus is deferred with a zero-delay timeout: the directive runs
// inside Vue's render flush, and focusing there fires the canvas blur
// synchronously while Svedit's selection watcher would still see the
// canvas as focused and steal focus right back via setBaseAndExtent.
// Deferring makes this the same code path as a manual click into
// the input, which is already handled.
const vFocusOnCreate: Directive<HTMLInputElement> = {
	mounted(input) {
		if (!consume_link_autofocus()) return;
		setTimeout(() => {
			if (input.isConnected) input.focus({ preventScroll: true });
		}, 0);
	}
};

function open_link(event: Event) {
	event.preventDefault();
	if (active_link.value?.href) window.open(active_link.value.href, '_blank', 'noopener');
}

function remove_link(event: Event) {
	event.preventDefault();
	const session = svedit.session;
	session.apply(session.tr.toggle_mark('link'));
}
</script>

<template>
	<div
		v-if="active_link_path && anchor_name"
		class="link-popover"
		:style="`position-anchor: --${anchor_name};`"
		@keydown="handle_keydown"
	>
		<input
			v-focus-on-create
			class="url-field"
			type="url"
			:value="committed_href"
			placeholder="Enter link URL"
			aria-label="Link URL"
			@change="commit_href(($event.currentTarget as HTMLInputElement).value)"
		/>
		<!-- Disabled while the field is empty — a valid href can be as short
		     as "/" or "#id", so emptiness is the only check we can make. -->
		<button title="Open in new tab" :disabled="committed_href === ''" @mousedown="open_link">
			<Icon name="external-link" />
		</button>
		<button title="Remove link" @mousedown="remove_link">
			<Icon name="backspace-delete" />
		</button>
	</div>
</template>

<style scoped>
/* Mirrors .editor-toolbar in Toolbar.vue, so toggling a link morphs
	   the floating toolbar into this popover: same design, placement and
	   size. Keep the values in sync with Toolbar.vue. */
.link-popover {
	--toolbar-item-max-width: 200px;
	position: fixed;
	bottom: anchor(top);
	justify-self: anchor-center;
	margin-bottom: var(--s-2);
	position-try-fallbacks: flip-block;
	position-visibility: anchors-visible;
	z-index: 60;
	display: flex;
	align-items: center;
	gap: 0;
	width: fit-content;
	max-width: calc(100vw - 2 * var(--s-4));
	padding: 4px;
	color: var(--foreground);
	background: var(--background);
	border: 1px solid oklch(from var(--foreground) l c h / 0.12);
	border-radius: 9999px;
	box-shadow:
		0 1px 2px oklch(0% 0 0 / 0.12),
		0 4px 16px oklch(0% 0 0 / 0.08);
	pointer-events: auto;
}

.url-field {
	padding: var(--s-1) var(--s-2);
	/* Reserve room for the enter hint so text can never run under it */
	padding-right: calc(var(--s-2) + 20px);
	border: none;
	background: transparent;
	color: var(--foreground);
	font: inherit;
	font-feature-settings: 'calt' 0;
	font-size: 14px;
	/* Fixed width on purpose: field-sizing measures the placeholder while
		   empty and the content afterwards, so the pill would visibly shrink
		   on the first typed character. Long URLs scroll within the field. */
	width: 12rem;
	max-width: var(--toolbar-item-max-width);
}

.url-field:focus {
	outline: none;
}

.link-popover button {
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	width: 36px;
	height: 36px;
	/* Pin the full 36px geometry like the toolbar: height alone would
		   lose to any outside min-height and stretch the circles into
		   ovals (and the pill taller than the toolbar). */
	min-width: 36px;
	min-height: 36px;
	aspect-ratio: 1 / 1;
	flex: 0 0 36px;
	padding: 0;
	border: none;
	border-radius: 50%;
	background: transparent;
	color: var(--foreground);
	cursor: pointer;
	transition:
		background 150ms,
		transform 150ms;
	outline: 1px solid transparent;
	--icon-color: var(--foreground);
}

@media (hover: hover) {
	.link-popover button:hover:not(:disabled) {
		background: oklch(from var(--foreground) l c h / 0.06);
	}
}

.link-popover button:active:not(:disabled) {
	background: oklch(from var(--foreground) l c h / 0.09);
	transform: translateY(1px) scale(0.95);
}

.link-popover button:disabled {
	background: transparent;
	cursor: not-allowed;
	--icon-color: oklch(from var(--foreground) l c h / 0.3);
}

.link-popover button:focus-visible {
	outline: 1px solid var(--editing);
	outline-offset: 1px;
}
</style>
