import { For, Show, createMemo } from 'solid-js';
import { serialize_path } from '@svedit/core';
import { use_svedit } from './context.js';
import type { DocumentPath } from './types.js';
import './NodeSelectionMarkers.css';

/**
 * Paints the selection frame over selected nodes (a multi-node selection)
 * or a selected property, anchored to their elements via CSS anchor
 * positioning. Rendered outside the canvas.
 */
export default function NodeSelectionMarkers() {
	const svedit = use_svedit();

	const selected_node_paths = createMemo((): DocumentPath[] | undefined => {
		const selection = svedit.session.selection;
		if (!selection) return;
		if (selection.type !== 'node' || selection.anchor_offset === selection.focus_offset) return;

		const paths: DocumentPath[] = [];
		const start = Math.min(selection.anchor_offset, selection.focus_offset);
		const end = Math.max(selection.anchor_offset, selection.focus_offset);
		for (let index = start; index < end; index++) {
			paths.push([...selection.path, index]);
		}
		return paths;
	});

	// Keyed by serialized path, so an unchanged frame keeps its element.
	const selected_node_keys = createMemo(() => selected_node_paths()?.map(serialize_path) ?? []);

	const property_path = createMemo(() => {
		const selection = svedit.session.selection;
		return selection?.type === 'property' ? serialize_path(selection.path) : null;
	});

	return (
		<>
			<Show when={property_path()}>
				{(path_str) => (
					<div
						class="selected-property-overlay"
						classList={{ unfocused: !svedit.canvas_focused }}
						style={`position-anchor: --${path_str()};`}
					/>
				)}
			</Show>
			<For each={selected_node_keys()}>
				{(path_str) => (
					<div
						class="selected-node-overlay"
						classList={{ unfocused: !svedit.canvas_focused }}
						style={`position-anchor: --${path_str};`}
					/>
				)}
			</For>
		</>
	);
}
