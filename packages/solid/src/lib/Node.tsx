import { createMemo, splitProps, useContext } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { get_range_classes, serialize_path } from '@svedit/core';
import { attach } from './attach.js';
import { NodeArrayMetaContext, use_svedit } from './context.js';
import { anchor_style, class_names } from './solid_utils.js';
import type { NodeProps, SveditRenderContext } from './types.js';
import './Node.css';

/**
 * Wrapper element for a document node. The node's type-specific content
 * is passed as children and inserted directly into the wrapper element.
 */
export default function Node(props: NodeProps) {
	// `mark` and `annotations` are forwarded by NodeArrayProperty for node
	// components that want them; the wrapper derives its range classes from
	// the node-array context instead, so they are split off and not rendered.
	const [local, , rest] = splitProps(
		props,
		['path', 'tag', 'class', 'style', 'children'],
		['mark', 'annotations']
	);
	const svedit = use_svedit() as SveditRenderContext;
	const node_array_meta = useContext(NodeArrayMetaContext);

	const node = createMemo(() => svedit.session.get(local.path));
	const path_str = createMemo(() => serialize_path(local.path));
	const child_index = createMemo(() => (node_array_meta ? (local.path.at(-1) as number) : -1));
	const is_first = () => Boolean(node_array_meta && child_index() === 0);
	const is_last = () => Boolean(node_array_meta && child_index() === node_array_meta.length - 1);

	// Marks and annotations covering this node become `mark-<type>` /
	// `anno-<type>` classes (plus `-start`/`-end` variants), see
	// get_range_classes in @svedit/core.
	const range_classes = createMemo(() => get_range_classes(node_array_meta, child_index()));

	return (
		<Dynamic
			{...rest}
			component={local.tag ?? 'div'}
			ref={(el: HTMLElement) =>
				attach(el, path_str, (key) => svedit.visibility_registry.track_node(key))
			}
			id={node().id}
			class={class_names(
				`node-${node().type}`,
				local.class,
				range_classes(),
				is_first() && 'first',
				is_last() && 'last'
			)}
			data-node-id={node().id}
			data-path={path_str()}
			data-type="node"
			style={anchor_style(`--${path_str()}`, local.style)}
		>
			{local.children}
		</Dynamic>
	);
}
