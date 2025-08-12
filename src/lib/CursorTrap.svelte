<script>
	let {
		type, // either 'position-zero-cursor-trap' or 'after-node-cursor-trap'
		anchor,
	} = $props();
</script>

<!-- 
Cursor trap that provides a contenteditable target for node_array cursor positioning.

The cursor orientation is automatically detected using CSS container queries:
- Set --layout-orientation: horizontal for horizontal child layouts (cursor traps will be vertical)
- Set --layout-orientation: vertical for vertical child layouts (cursor traps will be horizontal)
- Default is vertical cursor traps when no custom property is set
- For e.g. grids, use media queries and change the variable depending on the column count from horizontal to vertical

Example usage in component styles:
.my-horizontal-layout {
  --layout-orientation: horizontal; /* children arranged horizontally → vertical cursor traps */
  display: flex;
  flex-direction: row;
}

.my-vertical-layout {
  --layout-orientation: vertical; /* children arranged vertically → horizontal cursor traps */
  display: flex;
  flex-direction: column;
}
-->
<div
	class="cursor-trap svedit-selectable"
	class:after-node-cursor-trap={type === 'after-node-cursor-trap'}
	class:position-zero-cursor-trap={type === 'position-zero-cursor-trap'}
	data-type={type}
	style:anchor-name={anchor}
><br></div>

<style>
	.cursor-trap {
		cursor: pointer;
		z-index: 20;
	}

	.cursor-trap {
		/* We make the cursor as large as possible (filling the gap between nodes), so it's easy to click on it, with a minimum of 20px */
		--cursor-trap-size: max(20px, var(--column-gap, 0px));
		position: absolute;
		width: var(--cursor-trap-size);
		min-height: var(--cursor-trap-size);
		top: 0;
		height: 100%;
	}
	.cursor-trap {
		background-image: repeating-linear-gradient(to bottom,
			var(--stroke-color) 0%,
			var(--stroke-color) 4px,
			transparent 4px,
			transparent 8px
		);
		background-size: 1px 100%;
		background-position: center;
		background-repeat: no-repeat;
	}

	/* TODO: We may want to limit this to non-selected cursor traps only */
	.cursor-trap:hover {
		background-image: linear-gradient(to right,
			var(--stroke-color) 0%,
			var(--stroke-color) 2px,
			transparent 2px,
			transparent 100%
		);
		background-size: 1px 100%;
		background-position: center;
		background-repeat: no-repeat;
	}

	/* Container query-based orientation detection */
	/* For horizontal layouts (children in rows), cursor traps should be vertical */
	@container style(--layout-orientation: horizontal) {
		/* We place the cursor trap in the empty padding / gap space to not overlap node content */
		.cursor-trap.position-zero-cursor-trap {
			left: calc(-1 * var(--cursor-trap-size) / 2 - var(--padding-inline, 0px) / 2);
		}
		.cursor-trap.after-node-cursor-trap {
			right: calc(-1 * var(--cursor-trap-size) / 2 - var(--column-gap, 0px) / 2);
		}
	}

	/* For vertical layouts (children in columns), cursor traps should be horizontal */
	@container style(--layout-orientation: vertical) {
		.cursor-trap {
			/* Reset vertical styles */
			width: auto;
			height: var(--cursor-trap-size);
			min-height: var(--cursor-trap-size);
			top: auto;
			bottom: calc(-1 * var(--cursor-trap-size) / 2 - var(--row-gap, 0px) / 2);
			left: 0;
			right: 0;
			
			/* Horizontal cursor trap visual */
			background-image: repeating-linear-gradient(to right,
				var(--stroke-color) 0%, /** TODO: The stroke color should be contrasting with the background color: check luminocity and invert the stroke to the background color */
				var(--stroke-color) 4px,
				transparent 4px,
				transparent 8px
			);
			background-size: 100% 1px;
			background-position: center;
			background-repeat: no-repeat;
		}
		
		.cursor-trap:hover {
			background-image: linear-gradient(to bottom,
				var(--stroke-color) 0%,
				var(--stroke-color) 2px,
				transparent 2px,
				transparent 100%
			);
			background-size: 100% 1px;
			background-position: center;
			background-repeat: no-repeat;
		}
		
		/* We place the cursor trap in the empty padding / gap space to not overlap node content */
		.cursor-trap.position-zero-cursor-trap {
			bottom: auto;
			top: calc(-1 * var(--cursor-trap-size) / 2 - var(--padding-block, 0px) / 2);
			left: 0;
		}
		.cursor-trap.after-node-cursor-trap {
			bottom: calc(-1 * var(--cursor-trap-size) / 2 - var(--row-gap, 0px) / 2);
		}

	}

	:global(.empty-node-array .cursor-trap) {
		min-height: 48px;
		min-width: 48px;
		border-bottom: 1px dashed var(--stroke-color);
		/* outline: 1px dashed var(--stroke-color);
		background: none; */
		@media (pointer: fine) {
			min-height: 24px;
			min-width: 24px;
		}
	}
</style>
