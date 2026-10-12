import { useSvedit } from './hooks.js';
import { shallow_equal } from './reactive.js';
import { serialize_path } from '@svedit/core';
import type { CSSProperties } from 'react';
import type { DocumentPath, Selection } from './types.js';
import './NodeSelectionMarkers.css';

function get_selected_node_paths(selection: Selection | null): DocumentPath[] | undefined {
	const paths: DocumentPath[] = [];
	if (!selection) return;
	if (selection.type !== 'node' || selection.anchor_offset === selection.focus_offset) return;

	const start = Math.min(selection.anchor_offset, selection.focus_offset);
	const end = Math.max(selection.anchor_offset, selection.focus_offset);
	for (let index = start; index < end; index++) {
		paths.push([...selection.path, index]);
	}
	return paths;
}

/**
 * Renders the selection frames for node and property selections, anchored
 * to the selected elements with CSS anchor positioning.
 */
export default function NodeSelectionMarkers() {
	const { selection, canvas_focused } = useSvedit(
		(context) => ({
			selection: context.session.selection,
			canvas_focused: context.canvas_focused
		}),
		shallow_equal
	);
	const selected_node_paths = get_selected_node_paths(selection);
	const unfocused = canvas_focused ? '' : ' unfocused';

	return (
		<>
			{selection?.type === 'property' && (
				<div
					className={`selected-property-overlay${unfocused}`}
					style={{ positionAnchor: `--${serialize_path(selection.path)}` } as CSSProperties}
				></div>
			)}
			{selected_node_paths?.map((path) => {
				const path_str = serialize_path(path);
				return (
					<div
						key={path_str}
						className={`selected-node-overlay${unfocused}`}
						style={{ positionAnchor: `--${path_str}` } as CSSProperties}
					></div>
				);
			})}
		</>
	);
}
