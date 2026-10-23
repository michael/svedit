<script lang="ts">
import { computed, defineComponent, h, inject, provide, withDirectives } from 'vue';
import type { PropType, VNode } from 'vue';
import UnknownNode from './UnknownNode.vue';
import {
	create_node_array_render_context,
	get_covering_ranges,
	get_node_array_fragments,
	get_node_keys,
	serialize_path
} from '@svedit/core';
import DefaultNodeGap from './NodeGap.vue';
import DefaultNodeGapMarkers from './NodeGapMarkers.vue';
import { vAttach } from './attach.js';
import { style_to_string } from './vue_utils.js';
import type {
	DocumentPath,
	NodeArrayAttachmentContext,
	NodeId,
	Attachment,
	Mark,
	NodeArrayRenderContext,
	SveditRenderContext
} from './types.js';

/**
 * Renders a node_array property: the child nodes interleaved with node
 * gaps, mark wrappers around marked runs, and the gap markers.
 *
 * Rendered with a render function so all children are inserted as one
 * flat, keyed list — no Vue fragment anchors (empty text nodes) end up
 * between gaps and nodes inside the contenteditable canvas.
 */
export default defineComponent({
	name: 'NodeArrayProperty',
	inheritAttrs: false,
	props: {
		/** The full path to the property */
		path: { type: Array as PropType<DocumentPath>, required: true },
		/** Optional custom HTML tag */
		tag: { type: String, default: 'div' }
	},
	setup(props, { attrs }) {
		const svedit = inject<SveditRenderContext>('svedit')!;
		const NodeGap = computed(
			() => svedit.session.config.system_components?.node_gap ?? DefaultNodeGap
		);
		const NodeGapMarkers = computed(
			() => svedit.session.config.system_components?.node_gap_markers ?? DefaultNodeGapMarkers
		);

		// Pre-joined once per path change; reused by data-path and by every
		// NodeGap's should_position_gap call to avoid N+1 joins per render.
		const path_str = computed(() => serialize_path(props.path));

		const raw_value = computed(() => svedit.session.get(props.path));
		const node_ids = computed<NodeId[]>(() => raw_value.value.nodes);
		const marks = computed<Mark[]>(() => raw_value.value.marks);
		const annotations = computed<Attachment[]>(() => raw_value.value.annotations);

		const fragments = computed(() =>
			get_node_array_fragments(svedit.session, node_ids.value, marks.value)
		);
		const node_keys = computed(() => get_node_keys(node_ids.value));

		function get_annotation_contexts(node_index: number): NodeArrayAttachmentContext[] {
			return get_covering_ranges(svedit.session, annotations.value, node_index);
		}

		function get_mark(node_index: number): NodeArrayAttachmentContext | null {
			// The single mark wrapping this node, or null. Mark exclusivity
			// guarantees at most one. Annotations never wrap and are exposed via
			// `annotations` instead.
			return get_covering_ranges(svedit.session, marks.value, node_index)[0] ?? null;
		}

		// Mirrors the TextProperty pattern: a `focused` class follows
		// the model selection. Used by the CSS rule below to hide the empty-array
		// NodeGap while the caret is in the placeholder, so its <br> isn't a
		// second arrow-key stop (issue #260).
		const is_focused = computed(
			() =>
				svedit.session.selection?.type === 'node' &&
				serialize_path(svedit.session.selection.path) === path_str.value
		);

		// Lets Node self-serve the marks and annotations covering a child, so
		// node wrappers can carry range classes without every node component
		// having to thread the `mark`/`annotations` props through.
		provide<NodeArrayRenderContext>(
			'node_array_meta',
			create_node_array_render_context(
				() => svedit.session,
				() => raw_value.value
			)
		);

		function render_nodes(nodes_slice: NodeId[], start_index: number): VNode[] {
			const children: VNode[] = [];
			const count = node_ids.value.length;
			nodes_slice.forEach((id, slice_index) => {
				const index = start_index + slice_index;
				const node = svedit.session.get(id);
				const mark = get_mark(index);
				const node_annotations = get_annotation_contexts(index);
				const key = node_keys.value[index];
				// The gap before a node is keyed with the node, so it stays with
				// the node across reorders (mirrors the keyed each block that
				// owned both the gap and the node).
				children.push(
					h(NodeGap.value, {
						key: `gap:${key}`,
						array_path: props.path,
						offset: index,
						count
					})
				);
				const Component = svedit.session.config.node_components[node.type];
				if (Component) {
					children.push(
						h(Component, {
							key,
							path: [...props.path, index],
							mark,
							annotations: node_annotations
						})
					);
				} else {
					children.push(h(UnknownNode, { key, path: [...props.path, index] }));
				}
			});
			return children;
		}

		// We use the anchor of node_array in Overlays.vue to position the last insertion point in a horizontal layout based on the right edge of the container
		return () => {
			const { class: css_class, style, ...rest } = attrs;
			const extra_style = style_to_string(style);
			const children: VNode[] = [];
			const count = node_ids.value.length;

			if (count === 0 && svedit.editable) {
				const placeholder_path = serialize_path([...props.path, 0]);
				children.push(
					withDirectives(
						h(
							'div',
							{
								key: 'empty-node-placeholder',
								class: 'empty-node-placeholder',
								'data-path': placeholder_path,
								'data-type': 'node',
								style: `anchor-name: --${placeholder_path};`
							},
							[h(NodeGap.value, { array_path: props.path, offset: 0, count: 0, empty: true })]
						),
						[
							[
								vAttach,
								{
									key: placeholder_path,
									attach: svedit.visibility_registry.track_node(placeholder_path)
								}
							]
						]
					)
				);
			}

			fragments.value.forEach((fragment, fragment_index) => {
				if (fragment.type === 'nodes') {
					children.push(...render_nodes(fragment.nodes, fragment.start_index));
				} else if (fragment.type === 'mark') {
					const MarkComponent = svedit.session.config.node_components[fragment.node.type];
					if (MarkComponent) {
						children.push(
							h(
								MarkComponent,
								{
									key: `fragment:${fragment_index}`,
									path: [...props.path, 'marks', fragment.mark_index, 'node_id']
								},
								{ default: () => render_nodes(fragment.nodes, fragment.start_index) }
							)
						);
					} else {
						children.push(...render_nodes(fragment.nodes, fragment.start_index));
					}
				}
			});

			if (count > 0) {
				children.push(
					h(NodeGap.value, { key: 'gap:last', array_path: props.path, offset: count, count })
				);
			}
			if (svedit.editable && NodeGapMarkers.value) {
				children.push(h(NodeGapMarkers.value, { key: 'gap-markers', path: props.path, count }));
			}

			return withDirectives(
				h(
					props.tag,
					{
						...rest,
						class: [css_class, { focused: is_focused.value }],
						'data-type': 'node_array',
						'data-path': path_str.value,
						style: `anchor-name: --${path_str.value};${extra_style ? ` ${extra_style}` : ''}`
					},
					children
				),
				[
					[
						vAttach,
						{
							key: path_str.value,
							attach: svedit.visibility_registry.track_array(path_str.value)
						}
					]
				]
			);
		};
	}
});
</script>

<style>
/* position: relative makes this the containing block for the gap's
   .svedit-selectable, which fills it via inset:0. You may override to
   position: absolute (e.g. so an empty array doesn't occupy flow space)
   — still a containing block; then also set position: relative on the
   parent node-array container so this placeholder's inset:0 resolves
   against it. */
:where(.empty-node-placeholder) {
	position: relative;
	inset: 0;
	min-height: 40px;
	min-width: 24px;
	cursor: pointer;
}
</style>
