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
	/* These should be always applied, e.g. in CustomProperty.svelte */
	:global(.cursor-trap) {
		cursor: pointer;
	}
	
	.cursor-trap {
		z-index: 20;
		/* We make the cursor as large as possible (filling the gap between nodes), so it's easy to click on it, with a minimum of 20px */
		--preferred-cursor-trap-size: 48px;
		--min-cursor-trap-size: 8px;
		position: absolute;
		background-image: repeating-linear-gradient(to bottom,
			var(--stroke-color) 0%,
			var(--stroke-color) 4px,
			transparent 4px,
			transparent 8px
		);
	}
	.cursor-trap, .cursor-trap:hover {
		background-size: 1px 100%;
		background-position: center;
		background-repeat: no-repeat;
	}
	
	.cursor-trap {
		transition-property: background-image;
		transition-delay: 0.05s;
		transition-behavior: allow-discrete;
	}

	/* TODO: We may want to limit this to non-selected cursor traps only */
	.cursor-trap:hover {
		background-image: linear-gradient(to right,
			var(--stroke-color) 0%,
			var(--stroke-color) 2px,
			transparent 2px,
			transparent 100%
		);
	}

	/* Container query-based orientation detection */
	/* For horizontal layouts (children in rows), cursor traps should be vertical */
	@container style(--layout-orientation: horizontal) {
		.cursor-trap {
			top: 0;
			height: 100%;
		}
		/* We place the cursor trap in the empty padding / gap space to not overlap node content */
		.cursor-trap.position-zero-cursor-trap {
			/* Width is constrained to available padding space to prevent overflow */
			--width: max(
				var(--min-cursor-trap-size),
				min(var(--preferred-cursor-trap-size), var(--padding-inline, 0px))
			);
			width: var(--width);
			left: calc(-1 * var(--width) / 2 - max(var(--padding-inline, 0px), 0px) / 2);
		}
		.cursor-trap.after-node-cursor-trap {
			/* When gap ≠ padding, we subtract their difference to ensure the cursor trap doesn't
			   extend beyond the smaller of the two spaces, preventing overflow.
				 We then center align the cursor trap to the gap space. */
			--width: max(
				var(--min-cursor-trap-size),
				(min(var(--preferred-cursor-trap-size), var(--column-gap, 0px), var(--padding-inline, 0px)) 
				- abs(var(--column-gap, 0px) - var(--padding-inline, 0px)))
			);
			width: var(--width);
			right: calc(-1 * var(--width) / 2 - max(var(--column-gap, 0px), 0px) / 2); /** max here is to prevent negative values */
		}
	}

	/* For vertical layouts (children in columns), cursor traps should be horizontal */
	@container style(--layout-orientation: vertical) {
		.cursor-trap {
			/* Reset vertical styles */
			width: auto;
			top: auto;
			left: 0;
			right: 0;
			
			/* Horizontal cursor trap visual */
			background-image: repeating-linear-gradient(to right,
				var(--stroke-color) 0%, /** TODO: The stroke color should be contrasting with the background color: check luminocity and invert the stroke to the background color */
				var(--stroke-color) 4px,
				transparent 4px,
				transparent 8px
			);
		}
		.cursor-trap, .cursor-trap:hover {
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
		}
		
		/* We place the cursor trap in the empty padding / gap space to not overlap node content */
		.cursor-trap.position-zero-cursor-trap {
			/* Height is constrained to available padding space to prevent overflow */
			--height: max(
				var(--min-cursor-trap-size),
				min(var(--preferred-cursor-trap-size), var(--padding-block, 0px))
			);
			height: var(--height);
			bottom: auto;
			top: calc(-1 * var(--height) / 2 - max(var(--padding-block, 0px), 0px) / 2);
		}
		.cursor-trap.after-node-cursor-trap {
			/* Height is constrained to the smaller of gap and padding, ensuring no overflow */
			--height: max(
				var(--min-cursor-trap-size),
				min(var(--preferred-cursor-trap-size), var(--row-gap, 0px), var(--padding-block, 0px))
			);
			height: var(--height);
			bottom: calc(-1 * var(--height) / 2 - max(var(--row-gap, 0px), 0px) / 2);
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
