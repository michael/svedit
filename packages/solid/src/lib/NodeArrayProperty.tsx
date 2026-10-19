import { createMemo, mapArray, splitProps } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import UnknownNode from './UnknownNode.js';
import { calculate_fragment_ranges, paths_equal, serialize_path } from '@svedit/core';
import DefaultNodeGap from './NodeGap.js';
import DefaultNodeGapMarkers from './NodeGapMarkers.js';
import { attach } from './attach.js';
import { NodeArrayMetaContext, use_svedit } from './context.js';
import { anchor_style, class_names } from './solid_utils.js';
import type { Session } from '@svedit/core';
import type {
	AnyComponent,
	Attachment,
	DocumentPath,
	NodeArray,
	NodeArrayAttachmentContext,
	NodeArrayPropertyProps,
	NodeArrayRenderContext,
	NodeId,
	SveditRenderContext
} from './types.js';
import './NodeArrayProperty.css';

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

/**
 * One child slot of the node array. Entries are identified by their key
 * and cached, so the same slot keeps the same entry object (and therefore
 * its rendered DOM) across document changes. Everything positional (the
 * node index, the gap offset, the mark index) is derived from the current
 * layout by key, never stored on the entry.
 */
type Entry =
	| { kind: 'placeholder'; key: string }
	| { kind: 'gap'; key: string; node_key: string | null }
	| { kind: 'node'; key: string; node_id: NodeId }
	| { kind: 'mark'; key: string }
	| { kind: 'markers'; key: string };

type Layout = {
	entries: Entry[];
	/** Node index by node key (`<node_id>:<occurrence>`). */
	index_by_key: Map<string, number>;
	/** Child entries of each mark fragment, by fragment key. */
	mark_children: Map<string, Entry[]>;
	/** Mark index (into `marks`) of each mark fragment, by fragment key. */
	mark_index: Map<string, number>;
};

/**
 * Renders a node_array property: the child nodes interleaved with node
 * gaps, mark wrappers around marked runs, and the gap markers.
 *
 * The children are inserted as one flat, keyed list (no wrapper elements
 * or placeholder nodes between gaps and nodes inside the contenteditable
 * canvas). A node keeps its DOM across inserts, deletes and moves of its
 * siblings; only its derived inputs (path, mark, annotations) update.
 */
export default function NodeArrayProperty(props: NodeArrayPropertyProps) {
	const [local, rest] = splitProps(props, ['path', 'tag', 'class', 'style']);
	const svedit = use_svedit() as SveditRenderContext;
	const session = () => svedit.session;

	const NodeGap = createMemo<AnyComponent>(
		() => session().config.system_components?.node_gap ?? DefaultNodeGap
	);
	const NodeGapMarkers = createMemo<AnyComponent>(
		() => session().config.system_components?.node_gap_markers ?? DefaultNodeGapMarkers
	);

	// Pre-joined once per path change; reused by data-path and by every
	// NodeGap's should_position_gap call to avoid N+1 joins per render.
	const path_str = createMemo(() => serialize_path(local.path));
	const array_path = createMemo(() => local.path, undefined, { equals: paths_equal });

	const value = createMemo<NodeArray>(() => session().get(local.path));
	const count = createMemo(() => value().nodes.length);

	// Mirrors the TextProperty pattern: a `focused` class follows
	// the model selection. Used by the CSS rule in NodeArrayProperty.css
	// to hide the empty-array NodeGap while the caret is in the
	// placeholder, so its <br> isn't a second arrow-key stop (issue #260).
	const is_focused = createMemo(() => {
		const selection = session().selection;
		return selection?.type === 'node' && serialize_path(selection.path) === path_str();
	});

	const entry_cache: Map<string, Entry> = new Map();
	function entry<E extends Entry>(candidate: E): E {
		const cached = entry_cache.get(candidate.key);
		if (cached && cached.kind === candidate.kind) return cached as E;
		entry_cache.set(candidate.key, candidate);
		return candidate;
	}

	const layout = createMemo<Layout>(() => {
		// node_entries() below reads these synchronously, inside this memo.
		// eslint-disable-next-line solid/reactivity
		const { nodes: node_ids, marks } = value();
		const editable = svedit.editable;
		const index_by_key: Map<string, number> = new Map();
		const mark_children: Map<string, Entry[]> = new Map();
		const mark_index: Map<string, number> = new Map();
		const occurrences: Map<NodeId, number> = new Map();
		const used: Set<string> = new Set();
		const use = <E extends Entry>(candidate: E): E => {
			used.add(candidate.key);
			return entry(candidate);
		};

		// Keys are `<node_id>:<occurrence>`, so a node that appears twice in
		// the same array still gets a unique, stable key.
		const node_keys = node_ids.map((id) => {
			const occurrence = occurrences.get(id) ?? 0;
			occurrences.set(id, occurrence + 1);
			return `${id}:${occurrence}`;
		});
		node_keys.forEach((key, index) => index_by_key.set(key, index));

		function node_entries(start: number, end: number): Entry[] {
			const result: Entry[] = [];
			for (let index = start; index < end; index++) {
				const key = node_keys[index];
				// The gap before a node is keyed with the node, so it stays with
				// the node across reorders.
				result.push(use({ kind: 'gap', key: `gap:${key}`, node_key: key }));
				result.push(use({ kind: 'node', key, node_id: node_ids[index] }));
			}
			return result;
		}

		const entries: Entry[] = [];
		if (node_ids.length === 0 && editable) {
			entries.push(use({ kind: 'placeholder', key: 'empty-node-placeholder' }));
		}

		const ranges = calculate_fragment_ranges(node_ids.length, marks);
		ranges.forEach((range, fragment_index) => {
			if (range.type === 'mark') {
				const key = `fragment:${fragment_index}`;
				const has_component = Boolean(
					session().config.node_components[session().get(range.node_id)?.type]
				);
				if (has_component) {
					entries.push(use({ kind: 'mark', key }));
					mark_children.set(key, node_entries(range.start_offset, range.end_offset));
					mark_index.set(key, range.mark_index!);
				} else {
					entries.push(...node_entries(range.start_offset, range.end_offset));
				}
			} else if (range.type === 'content') {
				entries.push(...node_entries(range.start_offset, range.end_offset));
			}
		});

		if (node_ids.length > 0) {
			entries.push(use({ kind: 'gap', key: 'gap:last', node_key: null }));
		}
		if (editable) {
			entries.push(use({ kind: 'markers', key: 'gap-markers' }));
		}

		for (const key of entry_cache.keys()) {
			if (!used.has(key)) entry_cache.delete(key);
		}
		return { entries, index_by_key, mark_children, mark_index };
	});

	// Lets Node self-serve the marks and annotations covering a child, so
	// node wrappers can carry range classes without every node component
	// having to thread the `mark`/`annotations` props through. The object
	// is stable; its members read the live node array value.
	const node_array_meta: NodeArrayRenderContext = {
		get length() {
			return count();
		},
		mark_for(node_index: number) {
			// The single mark wrapping this node, or null. Mark exclusivity
			// guarantees at most one. Annotations never wrap and are exposed
			// via `annotations` instead.
			return get_covering_ranges(session(), value().marks, node_index)[0] ?? null;
		},
		annotations_for(node_index: number) {
			return get_covering_ranges(session(), value().annotations, node_index);
		}
	};

	function render_placeholder(): JSX.Element {
		const placeholder_path = createMemo(() => serialize_path([...local.path, 0]));
		return (
			<div
				ref={(el) =>
					attach(el, placeholder_path, (key) => svedit.visibility_registry.track_node(key))
				}
				class="empty-node-placeholder"
				data-path={placeholder_path()}
				data-type="node"
				style={anchor_style(`--${placeholder_path()}`)}
			>
				<Dynamic component={NodeGap()} array_path={array_path()} offset={0} count={0} empty />
			</div>
		);
	}

	function render_gap(node_key: string | null): JSX.Element {
		const offset = createMemo(() =>
			node_key === null ? count() : (layout().index_by_key.get(node_key) ?? 0)
		);
		return (
			<Dynamic component={NodeGap()} array_path={array_path()} offset={offset()} count={count()} />
		);
	}

	function render_node(key: string, node_id: NodeId): JSX.Element {
		const index = createMemo(() => layout().index_by_key.get(key) ?? -1);
		const child_path = createMemo<DocumentPath>(() => [...array_path(), index()], undefined, {
			equals: paths_equal
		});
		const Component = createMemo<AnyComponent>(
			() => session().config.node_components[session().get(node_id)?.type] ?? UnknownNode
		);
		const mark = createMemo(() => node_array_meta.mark_for(index()), undefined, {
			equals: attachment_context_equal
		});
		const annotations = createMemo(() => node_array_meta.annotations_for(index()), undefined, {
			equals: attachment_contexts_equal
		});
		return (
			<Dynamic
				component={Component()}
				path={child_path()}
				mark={mark()}
				annotations={annotations()}
			/>
		);
	}

	function render_mark(key: string): JSX.Element {
		const mark_index = createMemo(() => layout().mark_index.get(key) ?? 0);
		const MarkComponent = createMemo<AnyComponent>(() => {
			const mark = value().marks[mark_index()];
			return session().config.node_components[session().get(mark?.node_id)?.type];
		});
		const mark_path = createMemo<DocumentPath>(
			() => [...array_path(), 'marks', mark_index(), 'node_id'],
			undefined,
			{ equals: paths_equal }
		);
		const children = createMemo(() => layout().mark_children.get(key) ?? []);
		// render_entries maps the accessor inside a memo.
		// eslint-disable-next-line solid/reactivity
		const rendered = render_entries(children);
		return (
			<Dynamic component={MarkComponent()} path={mark_path()}>
				{rendered()}
			</Dynamic>
		);
	}

	function render_entry(item: Entry): JSX.Element {
		switch (item.kind) {
			case 'placeholder':
				return render_placeholder();
			case 'gap':
				return render_gap(item.node_key);
			case 'node':
				return render_node(item.key, item.node_id);
			case 'mark':
				return render_mark(item.key);
			case 'markers':
				return <Dynamic component={NodeGapMarkers()} path={array_path()} count={count()} />;
		}
	}

	function render_entries(entries: Accessor<Entry[]>): Accessor<JSX.Element[]> {
		return createMemo(mapArray(entries, render_entry));
	}

	// render_entries maps the accessor inside a memo.
	// eslint-disable-next-line solid/reactivity
	const rendered = render_entries(() => layout().entries);

	// We use the anchor of node_array in Overlays.tsx to position the last insertion point in a horizontal layout based on the right edge of the container
	return (
		<NodeArrayMetaContext.Provider value={node_array_meta}>
			<Dynamic
				{...rest}
				component={local.tag ?? 'div'}
				ref={(el: HTMLElement) =>
					attach(el, path_str, (key) => svedit.visibility_registry.track_array(key))
				}
				class={class_names(local.class, is_focused() && 'focused')}
				data-type="node_array"
				data-path={path_str()}
				style={anchor_style(`--${path_str()}`, local.style)}
			>
				{rendered()}
			</Dynamic>
		</NodeArrayMetaContext.Provider>
	);
}
