<script lang="ts">
import { computed, defineComponent, h, inject, normalizeClass, withDirectives } from 'vue';
import type { PropType } from 'vue';
import { get_range_classes, serialize_path } from '@svedit/core';
import { vAttach } from './attach.js';
import { style_to_string } from './vue_utils.js';
import type {
	DocumentPath,
	NodeArrayAttachmentContext,
	NodeArrayRenderContext,
	SveditRenderContext
} from './types.js';

/**
 * Wrapper element for a document node. Rendered with a render function
 * so the default slot is inserted directly, without Vue fragment anchor
 * text nodes inside the contenteditable canvas.
 */
export default defineComponent({
	name: 'Node',
	inheritAttrs: false,
	props: {
		/** The full path to the node */
		path: { type: Array as PropType<DocumentPath>, required: true },
		/** The single node-array mark wrapping this node, if any */
		mark: { type: Object as PropType<NodeArrayAttachmentContext | null>, default: null },
		/** All node-array annotations covering this node */
		annotations: {
			type: Array as PropType<Array<NodeArrayAttachmentContext>>,
			default: () => []
		},
		/** Optional custom HTML tag */
		tag: { type: String, default: 'div' }
	},
	setup(props, { attrs, slots }) {
		const svedit = inject<SveditRenderContext>('svedit')!;

		const node = computed(() => svedit.session.get(props.path));
		const path_str = computed(() => serialize_path(props.path));

		const node_array_meta = inject<NodeArrayRenderContext | undefined>(
			'node_array_meta',
			undefined
		);
		const child_index = computed(() => (node_array_meta ? (props.path.at(-1) as number) : -1));
		const is_first = computed(() => node_array_meta && child_index.value === 0);
		const is_last = computed(
			() => node_array_meta && child_index.value === node_array_meta.length - 1
		);

		// Marks and annotations covering this node become `mark-<type>` /
		// `anno-<type>` classes (plus `-start`/`-end` variants), see
		// get_range_classes in @svedit/core.
		const range_classes = computed(() => get_range_classes(node_array_meta, child_index.value));

		return () => {
			const { class: css_class, style, ...rest } = attrs;
			const classes = `node-${node.value.type} ${normalizeClass(css_class) || ''}${
				range_classes.value ? ` ${range_classes.value}` : ''
			}${is_first.value ? ' first' : ''}${is_last.value ? ' last' : ''}`;

			return withDirectives(
				h(
					props.tag,
					{
						...rest,
						id: node.value.id,
						class: classes,
						'data-node-id': node.value.id,
						'data-path': path_str.value,
						'data-type': 'node',
						style: `anchor-name: --${path_str.value};${style_to_string(style)}`
					},
					slots.default?.()
				),
				[
					[
						vAttach,
						{
							key: path_str.value,
							attach: svedit.visibility_registry.track_node(path_str.value)
						}
					]
				]
			);
		};
	}
});
</script>

<style scoped>
[data-type='node'] {
	/** any other position than static will break the anchor positioning of node gaps and node gap-marker */
	/* For developers who need to position their node with `position: absolute` or `position: relative`, they need to wrap their node in a div */
	position: static !important;
}
</style>
