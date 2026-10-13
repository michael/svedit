/* eslint-disable react-hooks/refs -- the element cache is read and replaced during render on purpose:
   it memoizes child elements across renders so unchanged siblings bail out of reconciliation. */
import { useMemo, useRef } from 'react';
import UnknownNode from './UnknownNode.js';
import { serialize_path, calculate_fragment_ranges } from '@svedit/core';
import DefaultNodeGap from './NodeGap.js';
import DefaultNodeGapMarkers from './NodeGapMarkers.js';
import { useAttach } from './attach.js';
import { NodeArrayMetaContext, useSveditContext } from './context.js';
import { useSvedit } from './hooks.js';
import { shallow_equal } from './reactive.js';
import { anchor_style, class_names } from './react_utils.js';
import type { ReactElement, ReactNode } from 'react';
import type { Session } from '@svedit/core';
import type {
	AnyComponent,
	NodeArray,
	NodeArrayAttachmentContext,
	NodeArrayFragment,
	NodeArrayPropertyProps,
	NodeId,
	Attachment,
	Mark,
	NodeArrayRenderContext,
	SveditRenderContext
} from './types.js';
import './NodeArrayProperty.css';

function get_fragments(session: Session, node_ids: NodeId[], marks: Mark[]): NodeArrayFragment[] {
	const ranges = calculate_fragment_ranges(node_ids.length, marks);
	const fragments: NodeArrayFragment[] = [];

	for (const range of ranges) {
		const nodes_slice = node_ids.slice(range.start_offset, range.end_offset);

		if (range.type === 'mark') {
			const node = session.get(range.node_id);
			fragments.push({
				type: 'mark',
				node,
				nodes: nodes_slice,
				start_index: range.start_offset,
				mark_index: range.mark_index!
			});
		} else if (range.type === 'content') {
			fragments.push({
				type: 'nodes',
				nodes: nodes_slice,
				start_index: range.start_offset
			});
		}
	}
	return fragments;
}

function get_range_context(
	session: Session,
	range: Attachment,
	index: number,
	node_index: number
): NodeArrayAttachmentContext {
	const node = session.get(range.node_id);
	const is_start = node_index === range.start_offset;
	const is_end = node_index === range.end_offset - 1;

	return {
		...range,
		index,
		node,
		is_start,
		is_middle: !is_start && !is_end,
		is_end
	};
}

function get_covering_ranges(
	session: Session,
	ranges: Attachment[],
	node_index: number
): NodeArrayAttachmentContext[] {
	return ranges
		.map((range, index) => ({ range, index }))
		.filter(({ range }) => range.start_offset <= node_index && node_index < range.end_offset)
		.map(({ range, index }) => get_range_context(session, range, index, node_index));
}

function attachment_context_equal(
	a: NodeArrayAttachmentContext | null,
	b: NodeArrayAttachmentContext | null
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.start_offset === b.start_offset &&
		a.end_offset === b.end_offset &&
		a.node_id === b.node_id &&
		a.index === b.index &&
		a.node === b.node &&
		a.is_start === b.is_start &&
		a.is_middle === b.is_middle &&
		a.is_end === b.is_end
	);
}

function attachment_contexts_equal(
	a: NodeArrayAttachmentContext[],
	b: NodeArrayAttachmentContext[]
): boolean {
	if (a.length !== b.length) return false;
	return a.every((context, index) => attachment_context_equal(context, b[index]));
}

type ChildInputs = {
	Component: AnyComponent;
	path_str: string;
	mark: NodeArrayAttachmentContext | null;
	annotations: NodeArrayAttachmentContext[];
};

type GapInputs = { Component: AnyComponent; path_str: string; offset: number; count: number };

type ElementCache = {
	nodes: Map<string, { inputs: ChildInputs; element: ReactElement }>;
	gaps: Map<string, { inputs: GapInputs; element: ReactElement }>;
};

/**
 * Renders a node_array property: the child nodes interleaved with node
 * gaps, mark wrappers around marked runs, and the gap markers.
 *
 * Child elements are cached per key and reused as long as their inputs
 * (path, component, mark and annotation context) are unchanged. React
 * skips reconciling a subtree whose element is referentially identical,
 * so a change in one node leaves its siblings untouched — the React
 * equivalent of Svelte's and Vue's fine-grained updates.
 */
export default function NodeArrayProperty({
	path,
	tag = 'div',
	className,
	style,
	...rest
}: NodeArrayPropertyProps) {
	const svedit = useSveditContext() as SveditRenderContext;
	// Pre-joined once per path change; reused by data-path and by every
	// NodeGap's should_position_gap call to avoid N+1 joins per render.
	const path_str = serialize_path(path);

	const { session, value, is_focused, editable, config } = useSvedit((context) => {
		const session = context.session;
		const value: NodeArray = session.get(path);
		// Child node types participate in the snapshot so an in-place type
		// change (which leaves the node array value untouched) still swaps
		// the rendered component.
		let types = '';
		for (const id of value.nodes) types += `${session.get(id)?.type ?? ''},`;
		for (const mark of value.marks) types += `${session.get(mark.node_id)?.type ?? ''},`;
		// Mirrors the TextProperty pattern: a `focused` class follows
		// the model selection. Used by the CSS rule in NodeArrayProperty.css
		// to hide the empty-array NodeGap while the caret is in the
		// placeholder, so its <br> isn't a second arrow-key stop (issue #260).
		const is_focused =
			session.selection?.type === 'node' && serialize_path(session.selection.path) === path_str;
		return {
			session,
			value,
			types,
			is_focused,
			editable: context.editable,
			config: session.config
		};
	}, shallow_equal);

	const NodeGap: AnyComponent = config.system_components?.node_gap ?? DefaultNodeGap;
	const NodeGapMarkers: AnyComponent =
		config.system_components?.node_gap_markers ?? DefaultNodeGapMarkers;
	const node_ids: NodeId[] = value.nodes;
	const marks: Mark[] = value.marks;
	const annotations: Attachment[] = value.annotations;
	const count = node_ids.length;

	// Lets Node self-serve the marks and annotations covering a child, so
	// node wrappers can carry range classes without every node component
	// having to thread the `mark`/`annotations` props through. The object
	// is stable; its members read the live node array value.
	const node_array_meta = useMemo<NodeArrayRenderContext>(() => {
		const current = () => session.get(path) as NodeArray;
		return {
			get length() {
				return current().nodes.length;
			},
			mark_for(node_index: number) {
				// The single mark wrapping this node, or null. Mark exclusivity
				// guarantees at most one. Annotations never wrap and are exposed
				// via `annotations` instead.
				return get_covering_ranges(session, current().marks, node_index)[0] ?? null;
			},
			annotations_for(node_index: number) {
				return get_covering_ranges(session, current().annotations, node_index);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [session, path_str]);

	const cache = useRef<ElementCache>({ nodes: new Map(), gaps: new Map() });
	const next_cache: ElementCache = { nodes: new Map(), gaps: new Map() };

	function get_node_key(node_id: NodeId, index: number): string {
		let occurrence = 0;
		for (let current_index = 0; current_index < index; current_index++) {
			if (node_ids[current_index] === node_id) occurrence += 1;
		}
		return `${node_id}:${occurrence}`;
	}

	function gap_element(key: string, offset: number, empty = false): ReactElement {
		const inputs: GapInputs = { Component: NodeGap, path_str, offset, count };
		const cached = cache.current.gaps.get(key);
		let element = cached?.element;
		if (!cached || !shallow_equal(cached.inputs, inputs)) {
			element = <NodeGap key={key} array_path={path} offset={offset} count={count} empty={empty} />;
		}
		next_cache.gaps.set(key, { inputs, element });
		return element;
	}

	function node_element(
		key: string,
		Component: AnyComponent,
		index: number,
		mark: NodeArrayAttachmentContext | null,
		node_annotations: NodeArrayAttachmentContext[]
	): ReactElement {
		const child_path_str = `${path_str}__${index}`;
		const inputs: ChildInputs = {
			Component,
			path_str: child_path_str,
			mark,
			annotations: node_annotations
		};
		const cached = cache.current.nodes.get(key);
		let element = cached?.element;
		if (
			!cached ||
			cached.inputs.Component !== Component ||
			cached.inputs.path_str !== child_path_str ||
			!attachment_context_equal(cached.inputs.mark, mark) ||
			!attachment_contexts_equal(cached.inputs.annotations, node_annotations)
		) {
			element = (
				<Component key={key} path={[...path, index]} mark={mark} annotations={node_annotations} />
			);
		}
		next_cache.nodes.set(key, { inputs, element });
		return element;
	}

	function render_nodes(nodes_slice: NodeId[], start_index: number): ReactNode[] {
		const children: ReactNode[] = [];
		nodes_slice.forEach((id, slice_index) => {
			const index = start_index + slice_index;
			const node = session.get(id);
			const mark = get_covering_ranges(session, marks, index)[0] ?? null;
			const node_annotations = get_covering_ranges(session, annotations, index);
			const key = get_node_key(id, index);
			// The gap before a node is keyed with the node, so it stays with
			// the node across reorders.
			children.push(gap_element(`gap:${key}`, index));
			const Component: AnyComponent = config.node_components[node.type] ?? UnknownNode;
			children.push(node_element(key, Component, index, mark, node_annotations));
		});
		return children;
	}

	const placeholder_path = serialize_path([...path, 0]);
	const placeholder_ref = useAttach(
		placeholder_path,
		svedit.visibility_registry.track_node(placeholder_path)
	);
	const array_ref = useAttach(path_str, svedit.visibility_registry.track_array(path_str));

	const children: ReactNode[] = [];

	if (count === 0 && editable) {
		children.push(
			<div
				key="empty-node-placeholder"
				ref={placeholder_ref}
				className="empty-node-placeholder"
				data-path={placeholder_path}
				data-type="node"
				style={anchor_style(`--${placeholder_path}`)}
			>
				<NodeGap array_path={path} offset={0} count={0} empty={true} />
			</div>
		);
	}

	get_fragments(session, node_ids, marks).forEach((fragment, fragment_index) => {
		if (fragment.type === 'nodes') {
			children.push(...render_nodes(fragment.nodes, fragment.start_index));
		} else if (fragment.type === 'mark') {
			const MarkComponent: AnyComponent | undefined = config.node_components[fragment.node.type];
			if (MarkComponent) {
				children.push(
					<MarkComponent
						key={`fragment:${fragment_index}`}
						path={[...path, 'marks', fragment.mark_index, 'node_id']}
					>
						{render_nodes(fragment.nodes, fragment.start_index)}
					</MarkComponent>
				);
			} else {
				children.push(...render_nodes(fragment.nodes, fragment.start_index));
			}
		}
	});

	if (count > 0) {
		children.push(gap_element('gap:last', count));
	}
	if (editable && NodeGapMarkers) {
		children.push(<NodeGapMarkers key="gap-markers" path={path} count={count} />);
	}

	cache.current = next_cache;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Tag = tag as any;
	// We use the anchor of node_array in Overlays.tsx to position the last insertion point in a horizontal layout based on the right edge of the container
	return (
		<NodeArrayMetaContext.Provider value={node_array_meta}>
			<Tag
				{...rest}
				ref={array_ref}
				className={class_names(className, is_focused && 'focused')}
				data-type="node_array"
				data-path={path_str}
				style={anchor_style(`--${path_str}`, style)}
			>
				{children}
			</Tag>
		</NodeArrayMetaContext.Provider>
	);
}
