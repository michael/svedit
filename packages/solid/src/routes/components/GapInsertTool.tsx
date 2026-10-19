import { Show, createMemo } from 'solid-js';
import type { NodeGapToolsProps } from '@svedit/solid';
import { use_app_svedit } from '../svedit_context.js';
import './GapInsertTool.css';

/**
 * Insert button rendered inside the active node gap marker (registered
 * via system_components.node_gap_tools). Because it lives inside the
 * marker it inherits --row from the node array, shows/hides together
 * with the caret, and positioning next to the gap is local CSS.
 */
export default function GapInsertTool(props: NodeGapToolsProps) {
	const svedit = use_app_svedit();

	// Default node_type for the node_array this gap belongs to — mirrors the
	// bottom toolbar's insert tool, but derived from the gap's own path
	// instead of the current selection.
	const default_node_type = createMemo(() => {
		const node_array_node = svedit.session.get(props.path.slice(0, -1));
		const node_array_property = props.path.at(-1) as string;

		const node_schema = svedit.session.schema[node_array_node?.type];
		if (!node_schema) return null;

		const property_definition = node_schema.properties[node_array_property];
		if (property_definition?.type !== 'node_array') return null;

		return (
			property_definition.default_node_type ||
			(property_definition.node_types?.length === 1 ? property_definition.node_types[0] : null)
		);
	});

	const inserter = createMemo(() =>
		default_node_type() ? svedit.session.config.inserters?.[default_node_type()] : null
	);

	function insert_default_node(event: MouseEvent) {
		// Keep canvas focus and the gap selection while the button is pressed
		event.preventDefault();
		const current_inserter = inserter();
		if (!current_inserter) return;
		const tr = svedit.session.tr;
		current_inserter(tr);
		svedit.session.apply(tr);
	}

	return (
		<Show when={inserter()}>
			<button
				class={`gap-insert-tool${props.is_last ? ' last' : ''}`}
				title="Insert (↵)"
				onMouseDown={insert_default_node}
			>
				<svg viewBox="0 0 15 15" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
					<path d="M7.5 3V12M3 7.5H12" stroke="currentColor" stroke-linecap="square" />
				</svg>
			</button>
		</Show>
	);
}
