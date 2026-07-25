<script lang="ts">
	import type { NodeGapToolsProps } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';

	/**
	 * Insert button rendered inside the active node gap marker (registered
	 * via system_components.node_gap_tools). Because it lives inside the
	 * marker it inherits --row from the node array, shows/hides together
	 * with the caret, and positioning next to the gap is local CSS.
	 */
	const svedit = get_svedit_context();

	let { path, is_last }: NodeGapToolsProps = $props();

	// Default node_type for the node_array this gap belongs to — mirrors the
	// bottom toolbar's insert tool, but derived from the gap's own path
	// instead of the current selection.
	let default_node_type = $derived.by(() => {
		const node_array_node = svedit.session.get(path.slice(0, -1));
		const node_array_property = path.at(-1);

		const node_schema = svedit.session.schema[node_array_node?.type];
		if (!node_schema) return null;

		const property_definition = node_schema.properties[node_array_property];
		if (property_definition?.type !== 'node_array') return null;

		return (
			property_definition.default_node_type ||
			(property_definition.node_types?.length === 1 ? property_definition.node_types[0] : null)
		);
	});

	let inserter = $derived(
		default_node_type ? svedit.session.config.inserters?.[default_node_type] : null
	);

	function insert_default_node(event: Event) {
		// Keep canvas focus and the gap selection while the button is pressed
		event.preventDefault();
		if (!inserter) return;
		const tr = svedit.session.tr;
		inserter(tr);
		svedit.session.apply(tr);
	}
</script>

{#if inserter}
	<button
		class="gap-insert-tool"
		class:last={is_last}
		title="Insert (↵)"
		onmousedown={insert_default_node}
	>
		<svg viewBox="0 0 15 15" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
			<path d="M7.5 3V12M3 7.5H12" stroke="currentColor" stroke-linecap="square" />
		</svg>
	</button>
{/if}

<style>
	/* Positioned relative to the gap marker it renders inside. The marker
	   hugs the gap in both row and column flow, so no anchor positioning is
	   needed here. Default: centered above the gap. The marker has
	   pointer-events: none, so re-enable them on the button. */
	.gap-insert-tool {
		position: absolute;
		pointer-events: auto;
		bottom: calc(100% + var(--s-1));
		left: 50%;
		translate: -50% 0;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid oklch(from var(--app-primary-text) l c h / 0.12);
		border-radius: 50%;
		background: var(--app-canvas-fill);
		color: var(--app-primary-text);
		box-shadow:
			0 1px 2px oklch(0% 0 0 / 0.12),
			0 4px 16px oklch(0% 0 0 / 0.08);
		cursor: pointer;
		transition:
			background 150ms,
			transform 150ms;
	}

	/* Last gap in column flow: below the gap instead of above */
	.gap-insert-tool.last {
		bottom: auto;
		top: calc(100% + var(--s-1));
	}

	/* Last gap in row flow (--row: 1): right of the gap, vertically centered */
	@container style(--row: 1) {
		.gap-insert-tool.last {
			top: 50%;
			left: calc(100% + var(--s-1));
			translate: 0 -50%;
		}
	}

	.gap-insert-tool svg {
		width: 24px;
		height: 24px;
	}

	@media (hover: hover) {
		.gap-insert-tool:hover {
			background: oklch(from var(--app-canvas-fill) calc(l - 0.03) c h);
		}
	}

	.gap-insert-tool:active {
		transform: translateY(1px) scale(0.95);
	}

	.gap-insert-tool:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 1px var(--svedit-editing-stroke);
	}

	/* Touch devices use the insert button in the bottom toolbar instead,
	   matching how the floating toolbar is handled. */
	@media (hover: none), (pointer: coarse) {
		.gap-insert-tool {
			display: none;
		}
	}
</style>
