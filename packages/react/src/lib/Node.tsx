import { useContext } from 'react';
import { get_range_classes, serialize_path } from '@svedit/core';
import { useAttach } from './attach.js';
import { NodeArrayMetaContext, useSveditContext } from './context.js';
import { useSvedit } from './hooks.js';
import { shallow_equal } from './reactive.js';
import { anchor_style, class_names } from './react_utils.js';
import type { NodeProps, SveditRenderContext } from './types.js';
import './Node.css';

/**
 * Wrapper element for a document node. The node's type-specific content
 * is passed as children.
 */
export default function Node({
	path,
	// `mark` and `annotations` are forwarded by NodeArrayProperty for node
	// components that want them; the wrapper derives its range classes from
	// the node-array context instead, so they are not read here.
	mark: _mark,
	annotations: _annotations,
	tag = 'div',
	className,
	style,
	children,
	...rest
}: NodeProps) {
	void _mark;
	void _annotations;
	const svedit = useSveditContext() as SveditRenderContext;
	const path_str = serialize_path(path);
	const node_array_meta = useContext(NodeArrayMetaContext);

	const { node, is_first, is_last, range_classes } = useSvedit((context) => {
		const node = context.session.get(path);
		const child_index = node_array_meta ? (path.at(-1) as number) : -1;
		const is_first = Boolean(node_array_meta && child_index === 0);
		const is_last = Boolean(node_array_meta && child_index === node_array_meta.length - 1);

		// Marks and annotations covering this node become `mark-<type>` /
		// `anno-<type>` classes (plus `-start`/`-end` variants), see
		// get_range_classes in @svedit/core.
		const range_classes = get_range_classes(node_array_meta, child_index);
		return { node, is_first, is_last, range_classes };
	}, shallow_equal);

	const ref = useAttach(path_str, svedit.visibility_registry.track_node(path_str));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Tag = tag as any;

	return (
		<Tag
			{...rest}
			ref={ref}
			id={node.id}
			className={class_names(
				`node-${node.type}`,
				className,
				range_classes,
				is_first && 'first',
				is_last && 'last'
			)}
			data-node-id={node.id}
			data-path={path_str}
			data-type="node"
			style={anchor_style(`--${path_str}`, style)}
		>
			{children}
		</Tag>
	);
}
