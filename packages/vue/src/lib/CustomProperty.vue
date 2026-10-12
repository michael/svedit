<script lang="ts">
import { computed, defineComponent, h } from 'vue';
import type { PropType } from 'vue';
import { serialize_path } from '@svedit/core';
import { style_to_string } from './vue_utils.js';
import type { DocumentPath } from './types.js';

/**
 * Wraps a non-text property (e.g. an image) and gives it a selectable
 * caret position. Rendered with a render function so the default slot
 * is inserted directly, without Vue fragment anchor text nodes inside
 * the contenteditable canvas.
 */
export default defineComponent({
	name: 'CustomProperty',
	inheritAttrs: false,
	props: {
		/** The full path to the property */
		path: { type: Array as PropType<DocumentPath>, required: true },
		/** Optional custom HTML tag */
		tag: { type: String, default: 'div' }
	},
	setup(props, { attrs, slots }) {
		const path_str = computed(() => serialize_path(props.path));

		return () => {
			const { class: css_class, style, ...rest } = attrs;
			const extra_style = style_to_string(style);
			return h(
				props.tag,
				{
					...rest,
					class: css_class,
					'data-type': 'property',
					'data-path': path_str.value,
					style: `anchor-name: --${path_str.value};${extra_style ? ` ${extra_style}` : ''}`
				},
				[
					h('div', { class: 'property-selectable' }, [
						h('div', { class: 'svedit-selectable' }, [h('br')])
					]),
					...(slots.default?.() ?? [])
				]
			);
		};
	}
});
</script>

<style scoped>
[data-type='property'] {
	position: relative;
}
.property-selectable {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1;
	outline: none;
	/* Position the hidden selectable element at the bottom so the
		   browser's native scroll-to-caret ensures the full property
		   is visible, not just the top edge. */
	display: none;
	align-items: flex-end;
	justify-content: center;
}
.svedit.editable .property-selectable {
	display: flex;
}
.svedit-selectable {
	caret-color: transparent;
}
</style>
