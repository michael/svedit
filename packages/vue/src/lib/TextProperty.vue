<script lang="ts">
import { computed, defineComponent, h, inject } from 'vue';
import type { PropType, VNode } from 'vue';
import {
	char_slice,
	get_char_length,
	paths_equal,
	serialize_path,
	get_selection_range,
	calculate_fragment_ranges
} from '@svedit/core';
import { style_to_string } from './vue_utils.js';
import type { DocumentPath, Mark, Fragment, SelectionRange, SveditContext } from './types.js';

/**
 * Renders an editable text property with inline marks.
 *
 * Rendered with a render function: the children array (text, mark
 * components and the trailing <br>) is inserted flat, so no Vue fragment
 * anchors (empty text nodes) or v-if comment placeholders end up inside
 * the contenteditable text element. The DOM-to-model selection mapping
 * walks these child nodes and relies on that.
 */
export default defineComponent({
	name: 'TextProperty',
	inheritAttrs: false,
	props: {
		/** The full path to the property */
		path: { type: Array as PropType<DocumentPath>, required: true },
		/** Optional custom HTML tag */
		tag: { type: String, default: 'div' },
		/** A placeholder to be rendered for empty content */
		placeholder: { type: String, default: '' }
	},
	setup(props, { attrs }) {
		const svedit = inject<SveditContext>('svedit')!;

		const path_str = computed(() => serialize_path(props.path));

		const is_focused = computed(() => {
			return (
				svedit.session.selection?.type === 'text' &&
				paths_equal(props.path, svedit.session.selection.path)
			);
		});

		const plain_text = computed(() => svedit.session.get(props.path).content);
		// A string has zero grapheme clusters iff it has zero code units, so a
		// plain length check avoids a full Intl.Segmenter pass (this computed
		// re-runs for every text property on every document change).
		const is_empty = computed(
			() => plain_text.value.length === 0 && !(svedit.is_composing && is_focused.value)
		);

		const is_collapsed = computed(() => {
			const selection = svedit.session.selection;
			return (
				is_focused.value &&
				selection?.type === 'text' &&
				selection.anchor_offset === selection.focus_offset
			);
		});

		// Get selection highlight range if it does not touch marks.
		// Only render selection highlight when canvas is NOT focused.
		// This avoids DOM mutations (splitting text nodes for highlight spans)
		// while the user is actively selecting, which would cause selection
		// feedback loops and scroll-to-focus issues.
		const selection_highlight_range = computed(() => {
			if (svedit.canvas_focused) return null;
			if (is_collapsed.value) return null;
			if (!is_focused.value) return null;
			if (svedit.session.selected_marks.length > 0) return null;
			const sel = svedit.session.selection;
			if (!sel || sel.type !== 'text') return null;
			return get_selection_range(sel);
		});

		const fragments = computed(() =>
			get_fragments(
				svedit.session.get(props.path).content,
				svedit.session.get(props.path).marks,
				selection_highlight_range.value
			)
		);

		/**
		 * Converts text with marks into renderable fragments for display.
		 * Annotations never fragment the text; they are data-only.
		 */
		function get_fragments(
			text: string,
			marks: Array<Mark>,
			selection_highlight_range?: SelectionRange | null
		): Array<Fragment> {
			// Fast path: no marks and no selection highlight means the whole text
			// is a single content fragment. This runs for EVERY text property on
			// EVERY document change, so skipping the two full Intl.Segmenter passes
			// (get_char_length + char_slice over the whole text) matters at scale.
			if (marks.length === 0 && !selection_highlight_range) {
				return text.length > 0 ? [text] : [];
			}

			const ranges = calculate_fragment_ranges(
				get_char_length(text),
				marks,
				selection_highlight_range
			);
			const fragments: Array<Fragment> = [];

			for (const range of ranges) {
				const content = char_slice(text, range.start_offset, range.end_offset);

				if (range.type === 'mark') {
					const node = svedit.session.get(range.node_id);
					if (!node) throw new Error(`Node not found for mark ${range.node_id}`);

					fragments.push({
						type: 'mark',
						node,
						content,
						mark_index: range.mark_index!
					});
				} else if (range.type === 'selection_highlight') {
					fragments.push({
						type: 'selection_highlight',
						content
					});
				} else {
					fragments.push(content);
				}
			}

			return fragments;
		}

		// We need to use <br> so the element is reachable by Arrow Up/Down navigation.
		// But as soon as the element is focused, we get rid of the <br> as it causes issues with caret positioning.
		// Before, we were just hiding it on focus, but that caused the caret to disappear on Safari Desktop (tested with v26).
		// Edge Case: Shift Enter stops working if <br> is not present on a non-empty text property.
		return () => {
			const { class: css_class, style, ...rest } = attrs;
			const children: Array<VNode | string> = [];

			fragments.value.forEach((fragment, index) => {
				if (typeof fragment === 'string') {
					children.push(fragment);
				} else if (fragment.type === 'selection_highlight') {
					children.push(
						h(
							'span',
							{
								key: index,
								class: 'selection-highlight',
								style: 'anchor-name: --selection-highlight;'
							},
							fragment.content
						)
					);
				} else if (fragment.type === 'mark') {
					const MarkComponent = svedit.session.config.node_components[fragment.node.type];
					if (MarkComponent) {
						children.push(
							h(MarkComponent, {
								key: index,
								path: [...props.path, 'marks', fragment.mark_index, 'node_id'],
								content: fragment.content
							})
						);
					} else {
						children.push(
							h('span', { key: index, class: `mark-${fragment.node.type}` }, fragment.content)
						);
					}
				}
			});

			if (!is_focused.value || !is_empty.value) {
				children.push(h('br', { key: 'br' }));
			}

			return h(
				props.tag,
				{
					...rest,
					placeholder: props.placeholder,
					class: [
						'text svedit-selectable',
						css_class,
						{ empty: is_empty.value, focused: is_focused.value }
					],
					'data-type': 'text',
					'data-path': path_str.value,
					style: `anchor-name: --${path_str.value};${style_to_string(style)}`
				},
				children
			);
		};
	}
});
</script>

<style>
/* Editable text base layout; :where() allows easy override without specificity conflicts. */
:where([data-type='text'].text) {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	box-sizing: content-box;
	/* A text property holding only newlines has no intrinsic width. When the
	   layout shrink-wraps it (inline-block, a centered flex column, ...) it would
	   collapse to 0px and Chrome has nowhere to draw the caret. */
	min-width: 1ch;
}
</style>

<style scoped>
/* We switch from ::before to ::after when the element is focused. So the the caret is always before the placeholder. */
[placeholder].empty:not(.focused)::before,
[placeholder].empty.focused::after {
	content: attr(placeholder);
	pointer-events: none;
	color: color-mix(in oklch, currentcolor 50%, transparent);
}

/* A virtual caret: to fix the caret vertical alignment issue in Chrome and Firefox for empty focused contenteditable with placeholders */
/* Browser BUG: iOS Safari only considers the caret color set on the top contenteditable element, not on nested elements (e.g. the second selector doesn't work in iOS Safari) */
:global(.svedit.editable .svedit-canvas:has([placeholder].empty.focused)),
.svedit.editable [placeholder].empty.focused {
	caret-color: transparent !important;
}
.svedit.editable [placeholder].empty.focused::before {
	content: '';
	/* we limit width & height to avoid layout shifts in case the text has a lower natural height */
	width: 0px;
	height: 1cap;
	display: inline-block;
	/* we use box-shadow to draw the caret shape, matching the native caret */
	box-shadow:
		0 -0.4cap 0 0.65px var(--editing, AccentColor),
		0 0 0 0.65px var(--editing, AccentColor),
		0 0.4cap 0 0.65px var(--editing, AccentColor);
	animation: var(
		--node-caret-animation,
		node-caret-blink var(--node-caret-blink-duration, 1.1s) ease-in-out infinite
	);
}

/* Hide flickering: in Chrome, the caret jumps from end of placeholder string to start of text property when we focus */
.text:not(.focused) {
	caret-color: transparent;
}

/* Disable text-transform when editable and focused so users see original text */
.svedit.editable .text.focused {
	text-transform: none !important;
}

/* Dim the selection highlight when canvas loses native focus */
.svedit-canvas:not(:focus-within) .selection-highlight {
	background: oklch(from var(--editing-muted) l 0 h / alpha);
}

/* Make a collapsed caret visible */
.svedit-canvas:not(:focus-within) .selection-highlight:empty {
	background: none;
	outline: 0.5px solid oklch(from var(--editing) l 0 h / alpha);
}
</style>
