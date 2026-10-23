import { useMemo } from 'react';
import { get_selection_range, get_text_fragments, paths_equal, serialize_path } from '@svedit/core';
import { useSvedit } from './hooks.js';
import { shallow_equal } from './reactive.js';
import { anchor_style, class_names } from './react_utils.js';
import type { ReactNode } from 'react';
import type { SelectionRange, TextPropertyProps, Text } from './types.js';
import './TextProperty.css';

/**
 * Renders an editable text property with inline marks.
 *
 * The children (text, mark components and the trailing <br>) are
 * rendered flat; React inserts no placeholder nodes, so the DOM-to-model
 * selection mapping can walk the child nodes directly.
 */
export default function TextProperty({
	path,
	tag = 'div',
	placeholder = '',
	className,
	style,
	...rest
}: TextPropertyProps) {
	const path_str = serialize_path(path);

	const { session, text, is_focused, is_empty, highlight_start, highlight_end, node_components } =
		useSvedit((context) => {
			const session = context.session;
			const selection = session.selection;
			const text: Text = session.get(path);
			const is_focused = selection?.type === 'text' && paths_equal(path, selection.path);
			// A string has zero grapheme clusters iff it has zero code units, so a
			// plain length check avoids a full Intl.Segmenter pass (this runs for
			// every text property on every document change).
			const is_empty = text.content.length === 0 && !(context.is_composing && is_focused);
			const is_collapsed =
				is_focused &&
				selection?.type === 'text' &&
				selection.anchor_offset === selection.focus_offset;

			// Get selection highlight range if it does not touch marks.
			// Only render selection highlight when canvas is NOT focused.
			// This avoids DOM mutations (splitting text nodes for highlight spans)
			// while the user is actively selecting, which would cause selection
			// feedback loops and scroll-to-focus issues.
			let highlight: SelectionRange | null = null;
			if (
				!context.canvas_focused &&
				!is_collapsed &&
				is_focused &&
				session.selected_marks.length === 0 &&
				selection?.type === 'text'
			) {
				highlight = get_selection_range(selection);
			}

			return {
				session,
				text,
				is_focused,
				is_empty,
				highlight_start: highlight ? highlight.start_offset : -1,
				highlight_end: highlight ? highlight.end_offset : -1,
				node_components: session.config.node_components
			};
		}, shallow_equal);

	const fragments = useMemo(
		() =>
			get_text_fragments(
				session,
				text.content,
				text.marks,
				highlight_start >= 0 ? { start_offset: highlight_start, end_offset: highlight_end } : null
			),
		[session, text, highlight_start, highlight_end]
	);

	const children: ReactNode[] = [];
	fragments.forEach((fragment, index) => {
		if (typeof fragment === 'string') {
			children.push(fragment);
		} else if (fragment.type === 'selection_highlight') {
			children.push(
				<span
					key={index}
					className="selection-highlight"
					style={anchor_style('--selection-highlight')}
				>
					{fragment.content}
				</span>
			);
		} else if (fragment.type === 'mark') {
			const MarkComponent = node_components[fragment.node.type];
			if (MarkComponent) {
				children.push(
					<MarkComponent
						key={index}
						path={[...path, 'marks', fragment.mark_index, 'node_id']}
						content={fragment.content}
					/>
				);
			} else {
				children.push(
					<span key={index} className={`mark-${fragment.node.type}`}>
						{fragment.content}
					</span>
				);
			}
		}
	});

	// We need to use <br> so the element is reachable by Arrow Up/Down navigation.
	// But as soon as the element is focused, we get rid of the <br> as it causes issues with caret positioning.
	// Before, we were just hiding it on focus, but that caused the caret to disappear on Safari Desktop (tested with v26).
	// Edge Case: Shift Enter stops working if <br> is not present on a non-empty text property.
	if (!is_focused || !is_empty) {
		children.push(<br key="br" />);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Tag = tag as any;
	return (
		<Tag
			{...rest}
			placeholder={placeholder}
			className={class_names(
				'text svedit-selectable',
				className,
				is_empty && 'empty',
				is_focused && 'focused'
			)}
			data-type="text"
			data-path={path_str}
			style={anchor_style(`--${path_str}`, style)}
		>
			{children}
		</Tag>
	);
}
