import { createMemo, mapArray, splitProps } from 'solid-js';
import type { JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
	char_slice,
	get_char_length,
	paths_equal,
	serialize_path,
	get_selection_range,
	calculate_fragment_ranges
} from '@svedit/core';
import { use_svedit } from './context.js';
import { anchor_style, class_names } from './solid_utils.js';
import type { Fragment, Mark, SelectionRange, Text, TextPropertyProps } from './types.js';
import type { Session } from '@svedit/core';
import './TextProperty.css';

/**
 * Converts text with marks into renderable fragments for display.
 * Annotations never fragment the text; they are data-only.
 */
function get_fragments(
	session: Session,
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

	const ranges = calculate_fragment_ranges(get_char_length(text), marks, selection_highlight_range);
	const fragments: Array<Fragment> = [];

	for (const range of ranges) {
		const content = char_slice(text, range.start_offset, range.end_offset);

		if (range.type === 'mark') {
			const node = session.get(range.node_id);
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

function fragments_equal(a: Fragment, b: Fragment): boolean {
	if (a === b) return true;
	if (typeof a === 'string' || typeof b === 'string') return false;
	if (a.type !== b.type || a.content !== b.content) return false;
	if (a.type === 'mark' && b.type === 'mark') {
		return a.node === b.node && a.mark_index === b.mark_index;
	}
	return true;
}

/**
 * Renders an editable text property with inline marks.
 *
 * The children (text, mark components and the trailing <br>) are
 * inserted as one flat array, the element's only child expression, so
 * Solid adds no placeholder nodes and the DOM-to-model selection mapping
 * can walk the child nodes directly. Fragments equal to the previous
 * render keep their object identity, so unchanged marks keep their DOM.
 */
export default function TextProperty(props: TextPropertyProps) {
	const [local, rest] = splitProps(props, ['path', 'tag', 'placeholder', 'class', 'style']);
	const svedit = use_svedit();
	const session = () => svedit.session;

	const path_str = createMemo(() => serialize_path(local.path));
	const text = createMemo<Text>(() => session().get(local.path));

	const is_focused = createMemo(() => {
		const selection = session().selection;
		return selection?.type === 'text' && paths_equal(local.path, selection.path);
	});

	// A string has zero grapheme clusters iff it has zero code units, so a
	// plain length check avoids a full Intl.Segmenter pass (this memo
	// re-runs for every text property on every document change).
	const is_empty = createMemo(
		() => text().content.length === 0 && !(svedit.is_composing && is_focused())
	);

	const is_collapsed = createMemo(() => {
		const selection = session().selection;
		return (
			is_focused() &&
			selection?.type === 'text' &&
			selection.anchor_offset === selection.focus_offset
		);
	});

	// Get selection highlight range if it does not touch marks.
	// Only render selection highlight when canvas is NOT focused.
	// This avoids DOM mutations (splitting text nodes for highlight spans)
	// while the user is actively selecting, which would cause selection
	// feedback loops and scroll-to-focus issues.
	const selection_highlight_range = createMemo<SelectionRange | null>(
		() => {
			if (svedit.canvas_focused) return null;
			if (is_collapsed()) return null;
			if (!is_focused()) return null;
			if (session().selected_marks.length > 0) return null;
			const selection = session().selection;
			if (!selection || selection.type !== 'text') return null;
			return get_selection_range(selection);
		},
		null,
		{
			equals: (a, b) =>
				a === b ||
				(a !== null &&
					b !== null &&
					a.start_offset === b.start_offset &&
					a.end_offset === b.end_offset)
		}
	);

	const fragments = createMemo<Fragment[]>((previous) => {
		const next = get_fragments(
			session(),
			text().content,
			text().marks,
			selection_highlight_range()
		);
		return next.map((fragment, index) =>
			previous && previous[index] !== undefined && fragments_equal(previous[index], fragment)
				? previous[index]
				: fragment
		);
	});

	const rendered = createMemo(
		mapArray(fragments, (fragment): JSX.Element => {
			if (typeof fragment === 'string') return fragment;
			if (fragment.type === 'selection_highlight') {
				return (
					<span class="selection-highlight" style={anchor_style('--selection-highlight')}>
						{fragment.content}
					</span>
				);
			}
			const MarkComponent = session().config.node_components[fragment.node.type];
			if (MarkComponent) {
				return (
					<Dynamic
						component={MarkComponent}
						path={[...local.path, 'marks', fragment.mark_index, 'node_id']}
						content={fragment.content}
					/>
				);
			}
			return <span class={`mark-${fragment.node.type}`}>{fragment.content}</span>;
		})
	);

	// We need to use <br> so the element is reachable by Arrow Up/Down navigation.
	// But as soon as the element is focused, we get rid of the <br> as it causes issues with caret positioning.
	// Before, we were just hiding it on focus, but that caused the caret to disappear on Safari Desktop (tested with v26).
	// Edge Case: Shift Enter stops working if <br> is not present on a non-empty text property.
	const br = (<br />) as HTMLBRElement;
	const children = () => {
		const items = rendered();
		return !is_focused() || !is_empty() ? [...items, br] : items;
	};

	return (
		<Dynamic
			{...rest}
			component={local.tag ?? 'div'}
			placeholder={local.placeholder ?? ''}
			class={class_names(
				'text svedit-selectable',
				local.class,
				is_empty() && 'empty',
				is_focused() && 'focused'
			)}
			data-type="text"
			data-path={path_str()}
			style={anchor_style(`--${path_str()}`, local.style)}
		>
			{children()}
		</Dynamic>
	);
}
