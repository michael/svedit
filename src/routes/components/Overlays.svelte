<script>
	import { getContext } from 'svelte';
	import Icon from './Icon.svelte';

	const svedit = getContext('svedit');

	let node_array_selection_paths = $derived(get_node_array_selection_paths());
	let node_cursor_info = $derived(get_node_cursor_info());
	let text_selection_info = $derived(get_text_selection_info());

	function get_node_array_selection_paths() {
		const paths = [];
		const sel = svedit.doc.selection;
		if (!sel) return;

		// Node selection. Not collapsed.
		if (sel.type === 'node' && sel.anchor_offset !== sel.focus_offset) {
			const start = Math.min(sel.anchor_offset, sel.focus_offset);
			const end = Math.max(sel.anchor_offset, sel.focus_offset);

			for (let index = start; index < end; index++) {
				paths.push([...sel.path, index]);
			}
			return paths;
		}
	}

	function get_node_cursor_info() {
		const sel = svedit.doc.selection;
		if (!sel) return;

		if (sel.type === 'node' && sel.anchor_offset === sel.focus_offset) {
			const node_array = svedit.doc.get(sel.path);
			let node_index, position;

			if (sel.anchor_offset === 0) {
				// Edge case: Cursor is at the very beginning
				node_index = sel.anchor_offset;
				position = 'before';
			} else {
				node_index = sel.anchor_offset - 1;
				position = 'after';
			}
			return {
				path: [...sel.path, node_index],
				position
			};
		}
	}

	function get_text_selection_info() {
		const sel = svedit.doc.selection;
		if (!sel || sel.type !== 'text') return null;

		const active_annotation = svedit.doc.active_annotation();
		if (active_annotation && active_annotation[2] === 'link') {
			const annotated_string = svedit.doc.get(sel.path);
			const annotation_index = annotated_string[1].indexOf(active_annotation);
			return {
				path: sel.path,
				annotation: active_annotation,
				annotation_index: annotation_index
			};
		}
		return null;
	}

	function open_link() {
		if (text_selection_info?.annotation?.[3]?.href) {
			window.open(text_selection_info.annotation[3].href, '_blank');
		}
	}
</script>

{#if svedit.doc.selection?.type === 'property'}
	<div
		class="property-selection-overlay"
		style="position-anchor: --{svedit.doc.selection.path.join('-')};"
	></div>
{/if}
<!-- Here we render  and other stuff that should lay atop of the canvas -->
<!-- NOTE: we are using CSS Anchor Positioning, which currently only works in the latest Chrome browser -->
{#if node_array_selection_paths}
	<!-- Render node selection fragments (one per selected node)-->
	{#each node_array_selection_paths as path}
		<div class="node-selection-fragment" style="position-anchor: --{path.join('-')};"></div>
	{/each}
{:else if node_cursor_info}
	<div
		class="node-cursor"
		class:after={node_cursor_info.position === 'after'}
		class:before={node_cursor_info.position === 'before'}
		style="position-anchor: --{node_cursor_info.path.join('-') + '-' + (node_cursor_info.position === 'before' ? 'before' : 'after')};"
	><div class="cursor-bar"></div></div>
{/if}

{#if text_selection_info}
	<div
		class="text-selection-overlay"
		style="position-anchor: --{text_selection_info.path.join('-') +
			'-' +
			text_selection_info.annotation_index};"
	>
		<button onclick={open_link} class="small"><Icon name="external-link" /></button>
	</div>
{/if}

<style>
	/* This should be an exact overlay */
	.node-selection-fragment,
	.property-selection-overlay {
		position: absolute;
		background: var(--editing-fill-color);
		border: 1px solid var(--editing-stroke-color);
		border-radius: 2px;

		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		pointer-events: none;
	}

	.node-cursor {
		--node-cursor-size: 2px;
		position: absolute;
		pointer-events: none;	
		container-type: size;
		left: anchor(left); /*  We seize the container to match the anchor dimensions, so we can use the container query to orient the cursor bar either horizontally or vertically */
		right: anchor(right);
		top: anchor(top);
		bottom: anchor(bottom);
		/* Fancy transitions? Look smooth along the axis of the bar, but not across it ... */
		/* transition: inset 0.05s cubic-bezier(1,0,0,.1); */
	}
	.cursor-bar {
		position: absolute;
		background: var(--editing-stroke-color);
		/* 1s is blink rate of the regular text cursor */		
		animation: blink 1s step-end infinite; 
		/* Default: vertical cursor for row oriented nodes */
		left: calc(50% - var(--node-cursor-size) / 2);
		right: calc(50% - var(--node-cursor-size) / 2);
		top: 0;
		bottom: 0;
		border-radius: var(--node-cursor-size);
	}
	:global(.svedit:active) {
		.cursor-bar {
			/* When the is keep pressing the mouse button, we don't want the cursor to blink */
			/* This mimics the behavior of the regular text cursor */
			animation: none;
		}
	}
	
	/* Override: horizontal cursor for column oriented nodes */
	@container (aspect-ratio > 1) {
		.cursor-bar {
			left: 0;
			right: 0;
			top: calc(50% - var(--node-cursor-size) / 2);
			bottom: calc(50% - var(--node-cursor-size) / 2);
		}
	}

	@keyframes blink {
		from,
		to {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}

	.text-selection-overlay {
		position: absolute;
		top: anchor(top);
		left: anchor(right);
		pointer-events: auto;
		transform: translateX(var(--s-1)) translateY(-12px);
		z-index: 10;
	}

	.text-selection-overlay button {
		color: var(--primary-text-color);
		--icon-color: var(--primary-text-color);
		box-shadow: var(--shadow-2);
	}
</style>
