<script lang="ts">
import { computed, defineComponent, h } from 'vue';
import type { PropType } from 'vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

/**
 * Mark component used for both text marks (`content` prop) and node-array
 * marks (child nodes in the default slot). Rendered with a render function
 * so the slot content is inserted directly, without Vue fragment anchor
 * text nodes between the wrapped node gaps and nodes.
 */
export default defineComponent({
	name: 'SectionMark',
	props: {
		path: { type: Array as PropType<DocumentPath>, required: true },
		content: { type: String, default: undefined }
	},
	setup(props, { slots }) {
		const svedit = get_svedit_context();
		const node = computed<Nodes['section']>(() => svedit.session.get(props.path));

		return () =>
			h(
				'section',
				{ id: node.value.id, class: 'section', 'data-node-id': node.value.id },
				slots.default ? slots.default() : props.content
			);
	}
});
</script>

<style scoped>
.section {
	display: block;
	background: color-mix(in oklch, var(--foreground) 4.5%, var(--background));
	box-shadow:
		inset 0 1px 0 color-mix(in oklch, var(--foreground) 16%, transparent),
		inset 0 -1px 0 color-mix(in oklch, var(--foreground) 16%, transparent);
}

/* Stacked sections share one hairline instead of doubling it */
.section + .section {
	box-shadow: inset 0 -1px 0 color-mix(in oklch, var(--foreground) 16%, transparent);
}
</style>
