import { useSvedit } from './hooks.js';
import { shallow_equal } from './reactive.js';
import { get_selected_node_paths, serialize_path } from '@svedit/core';
import type { CSSProperties } from 'react';
import './NodeSelectionMarkers.css';

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
