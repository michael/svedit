<script>
	import { getContext } from 'svelte';
	import Icon from './Icon.svelte';

	const EDGE_GAP_PX = 24;
	const DRAG_THRESHOLD_PX = 4;

	const svedit = getContext('svedit');
	let selected_node_paths = $derived(get_selected_node_paths());
	let active_link_path = $derived(get_active_link_path());
	let active_link = $derived(active_link_path ? svedit.session.get(active_link_path) : null);
	let cursor_insertion_point_key = $derived(get_cursor_insertion_point_key());

	/** @type {Record<string, boolean>} Maps data-path → true when horizontal */
	let orientation_cache = $state({});
	let orientation_ready = $state(false); // Avoid first-frame gap misplacement before cache warmup.

	$effect(() => {
		// Re-run when the document changes (doc is $state.raw, new ref on every mutation)
		// This fixes e.g. misplacement of insertion-points after copy and paste or move commands.
		svedit.session.doc;

		function sync_orientation_cache() {
			/** @type {Record<string, boolean>} */
			const cache = {};
			for (const el of document.querySelectorAll('[data-type="node_array"]')) {
				const value = getComputedStyle(el)
					.getPropertyValue('--is-horizontal').trim();
				if (value === '1') {
					cache[/** @type {HTMLElement} */ (el).dataset.path] = true;
				}
			}
			orientation_cache = cache;
			orientation_ready = true;
		}
		sync_orientation_cache();
		window.addEventListener('resize', sync_orientation_cache);
		return () => window.removeEventListener('resize', sync_orientation_cache);
	});

	let insertion_points = $derived(build_all_insertion_points());

	// Imperatively sync data-selected on node elements — O(changed) not O(all_nodes)
	// $effect(() => {
	// 	const sel = svedit.session.selection;
	// 	const selected_paths = new Set();

	// 	if (sel?.type === 'node' && sel.anchor_offset !== sel.focus_offset) {
	// 		const start = Math.min(sel.anchor_offset, sel.focus_offset);
	// 		const end = Math.max(sel.anchor_offset, sel.focus_offset);
	// 		for (let i = start; i < end; i++) {
	// 			selected_paths.add([...sel.path, i].join('.'));
	// 		}
	// 	}

	// 	for (const el of document.querySelectorAll('[data-type="node"][data-selected]')) {
	// 		if (!selected_paths.has(/** @type {HTMLElement} */ (el).dataset.path)) {
	// 			el.removeAttribute('data-selected');
	// 		} else {
	// 			selected_paths.delete(/** @type {HTMLElement} */ (el).dataset.path);
	// 		}
	// 	}

	// 	for (const path_str of selected_paths) {
	// 		document.querySelector(`[data-type="node"][data-path="${path_str}"]`)
	// 			?.setAttribute('data-selected', 'true');
	// 	}
	// });

	/**
	 * Key of the active insertion-point that should show the blinking cursor.
	 * We track by key (not copied anchor styles) because rendering the cursor as
	 * a child of the active insertion point is the most robust Safari behavior.
	 * @returns {string | null}
	 */
	function get_cursor_insertion_point_key() {
		const selection = svedit.session.selection;
		if (!selection || selection.type !== 'node') return null;
		if (selection.anchor_offset !== selection.focus_offset) return null;

		const active_point = insertion_points.find(g =>
			g.offset === selection.anchor_offset
			&& g.path.join('.') === selection.path.join('.')
		);
		return active_point?.key ?? null;
	}

	function get_selected_node_paths() {
		const paths = [];
		const selection = svedit.session.selection;
		if (!selection) return;
		if (selection.type !== 'node' || selection.anchor_offset === selection.focus_offset) return;

		const start = Math.min(selection.anchor_offset, selection.focus_offset);
		const end = Math.max(selection.anchor_offset, selection.focus_offset);
		for (let index = start; index < end; index++) {
			paths.push([...selection.path, index]);
		}
		return paths;
	}

	function get_active_link_path() {
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return null;

		const active_annotation = svedit.session.active_annotation('link');
		if (active_annotation) {
			const annotated_text = svedit.session.get(sel.path);
			const annotation_index = annotated_text.annotations.indexOf(active_annotation);
			return [...sel.path, 'annotations', annotation_index, 'node_id'];
		}
		return null;
	}

	/**
	 * Build all insertion points for every node array in the document,
	 * including nested ones (e.g. image_grid_items inside an image_grid).
	 * @returns {Array<{ key: string, path: Array<string|number>, offset: number, style: string, is_horizontal: boolean }>}
	 */
	function build_all_insertion_points() {
		if (!svedit.editable || !orientation_ready) return [];
		const targets = [];
		collect_insertion_points([svedit.session.document_id], targets);
		return targets;
	}

	/**
	 * Recursively walk a node's schema properties, emitting insertion points
	 * for every node_array encountered and descending into child nodes.
	 * @param {Array<string|number>} node_path
	 * @param {Array<{ key: string, path: Array<string|number>, offset: number, style: string, is_horizontal: boolean }>} targets
	 */
	function collect_insertion_points(node_path, targets) {
		const node = svedit.session.get(node_path);
		if (!node || typeof node !== 'object') return;

		const schema = svedit.session.schema[node.type];
		if (!schema?.properties) return;

		for (const [prop_name, prop_def] of Object.entries(schema.properties)) {
			if (prop_def.type !== 'node_array') continue;
			const array_path = [...node_path, prop_name];
			const node_ids = svedit.session.get(array_path);
			if (!Array.isArray(node_ids)) continue;
			const is_horizontal = orientation_cache[array_path.join('.')] === true;

			const count = node_ids.length;

			if (count === 0) {
				// Empty arrays still need one full-size insertion target.
				const anchor = `--${[...array_path, 0].join('-')}`;
				targets.push({
					key: `${array_path.join('.')}-gap-0`,
					path: array_path,
					offset: 0,
					style: `top: anchor(${anchor} top); left: anchor(${anchor} left); bottom: anchor(${anchor} bottom); right: anchor(${anchor} right)`,
					is_horizontal
				});
				continue;
			}

			for (let offset = 0; offset <= count; offset++) {
				const prev = offset > 0 ? `--${[...array_path, offset - 1].join('-')}` : null;
				const next = offset < count ? `--${[...array_path, offset].join('-')}` : null;
				if (!prev && !next) continue;
			const style = (prev && next)
				? (is_horizontal ? build_row_gap_style(prev, next) : build_column_gap_style(prev, next))
				: build_edge_gap_style(prev || next, !prev, is_horizontal);
			targets.push({
					key: `${array_path.join('.')}-gap-${offset}`,
					path: array_path,
					offset,
					style,
					is_horizontal
				});
			}

			for (let i = 0; i < count; i++) {
				collect_insertion_points([...array_path, i], targets);
			}
		}
	}

	/**
	 * Column-layout insertion point between two siblings. The min() trick on both axes lets
	 * CSS anchor positioning resolve the rectangle automatically.
	 * 
	 * To ensure the 8px min-height target stays centered even if the gap is smaller than 8px,
	 * we use max() with the center point minus 4px (half the min-height).
	 * If the distance is >8px, this value is smaller than `anchor(bottom)` and `anchor(top)`,
	 * but if the distance is <8px, this `max` calculation prevents it from shrinking past
	 * the center minus half of 8px, forcing it to stick out equally on both sides.
	 * @param {string} prev  @param {string} next  @returns {string}
	 */
	function build_column_gap_style(prev, next) {
		const center_y = `(anchor(${prev} bottom) + anchor(${next} top)) / 2`;
		return [
			`top: min(anchor(${prev} bottom), calc(${center_y} - var(--insertion-point-min-size, 8px) / 2))`,
			`bottom: min(anchor(${next} top), calc(${center_y} - var(--insertion-point-min-size, 8px) / 2))`,
			`left: min(anchor(${prev} right), anchor(${next} left))`,
			`right: min(anchor(${prev} right), anchor(${next} left))`
		].join('; ');
	}

	/**
	 * Row-layout insertion point between two siblings. Spans prev's cross-axis extent from
	 * prev's trailing edge to next's leading edge.
	 *
	 * When nodes are on the same line, the gap expands naturally to fill the space
	 * between them. However, when the next node wraps to a new line, we want the gap
	 * to cap at exactly EDGE_GAP_PX.
	 *
	 * CSS doesn't have "if wrapped" logic, so we use math multiplier tricks:
	 * - is_wrapped: massive when prev_right > next_left, 0 otherwise.
	 * - is_not_wrapped: massive when next_left >= prev_right, 0 otherwise.
	 * 
	 * These multipliers allow us to select centering + natural width when on the same line,
	 * and a fixed right-extending block when wrapped to a new line.
	 * @param {string} prev  @param {string} next  @returns {string}
	 */
	function build_row_gap_style(prev, next) {
		const center_x = `(anchor(${prev} right) + anchor(${next} left)) / 2`;
		const half_gap = `(var(--insertion-point-min-size, 8px) / 2)`;
		return [
			`top: anchor(${prev} top)`,
			`bottom: anchor(${prev} bottom)`,
			`left: min(anchor(${prev} right), calc(${center_x} - ${half_gap} + max(0px, anchor(${prev} right) - anchor(${next} left)) * 999))`,
			`right: min(anchor(${next} left), calc(${center_x} - ${half_gap}), max(anchor(${prev} right) - ${EDGE_GAP_PX}px, anchor(${prev} right) - (anchor(${next} left) - anchor(${prev} right)) * 999))`
		].join('; ');
	}

	/**
	 * Edge insertion point (before-first or after-last). An EDGE_GAP_PX strip adjacent to
	 * `anchor`, spanning its cross-axis extent. Orientation-aware: horizontal
	 * strips for column layouts, vertical strips for row layouts.
	 * @param {string} anchor  @param {boolean} is_before  @param {boolean} is_horizontal
	 * @returns {string}
	 */
	function build_edge_gap_style(anchor, is_before, is_horizontal) {
		const cross = is_horizontal
			? [`top: anchor(${anchor} top)`, `bottom: anchor(${anchor} bottom)`]
			: [`left: anchor(${anchor} left)`, `right: anchor(${anchor} right)`];

		const [near, far, edge] = is_horizontal
			? (is_before ? ['right', 'left', 'left'] : ['left', 'right', 'right'])
			: (is_before ? ['bottom', 'top', 'top'] : ['top', 'bottom', 'bottom']);

		return [
			...cross,
			`${near}: anchor(${anchor} ${edge})`,
			`${far}: calc(anchor(${anchor} ${edge}) - ${EDGE_GAP_PX}px)`,
			`min-height: ${EDGE_GAP_PX}px`,
			`min-width: ${EDGE_GAP_PX}px`
		].join('; ');
	}

	/**
	 * Walk up the DOM from `el` to find the closest node element that belongs
	 * to the given node_array path.
	 * @param {Element} el
	 * @param {string} array_path_str - dot-joined node_array path
	 * @returns {HTMLElement | null}
	 */
	function find_closest_node_in_array(el, array_path_str) {
		let node_el = /** @type {HTMLElement | null} */ (
			el.closest('[data-type="node"][data-path]')
		);
		while (node_el) {
			const node_path = node_el.dataset.path.split('.');
			const parent_path = node_path.slice(0, -1).join('.');
			if (parent_path === array_path_str) return node_el;
			node_el = /** @type {HTMLElement | null} */ (
				node_el.parentElement?.closest('[data-type="node"][data-path]')
			);
		}
		return null;
	}

	/**
	 * Handle pointerdown on an insertion point. Sets a collapsed node cursor
	 * immediately, then tracks pointer movement to support drag-selection
	 * across multiple nodes.
	 *
	 * @param {PointerEvent} e
	 * @param {{ path: Array<string|number>, offset: number }} gap
	 */
	function handle_insertion_point_pointerdown(e, gap) {
		e.preventDefault();

		// Place a collapsed cursor at this gap immediately
		svedit.session.selection = {
			type: 'node',
			path: gap.path,
			anchor_offset: gap.offset,
			focus_offset: gap.offset
		};

		const start_x = e.clientX;
		const start_y = e.clientY;
		const origin_el = e.currentTarget;
		const array_path_str = gap.path.join('.');
		let dragging = false;

		// Pre-compute ancestor array paths for cross-level escalation.
		// Path format alternates [node_id, prop, child_index, prop, ...],
		// so stripping 2 segments yields the parent array path.
		const ancestor_paths = [];
		for (let len = gap.path.length - 2; len >= 2; len -= 2) {
			const path = gap.path.slice(0, len);
			ancestor_paths.push({
				path,
				str: path.join('.'),
				container_index: parseInt(gap.path[len], 10)
			});
		}

		function on_pointermove(/** @type {PointerEvent} */ e) {
			// Ignore micro-movements to distinguish click from drag
			if (!dragging) {
				if (Math.abs(e.clientX - start_x) + Math.abs(e.clientY - start_y) < DRAG_THRESHOLD_PX) return;
				dragging = true;
			}

			const elements = document.elementsFromPoint(e.clientX, e.clientY);
			let over_origin = false;
			for (const el of elements) {
				if (el === origin_el) { over_origin = true; break; }
			}

			let node_el = null;
			let sel_path = gap.path;
			let sel_anchor = gap.offset;

			// Pass 1: look for a node in the same array
			for (const el of elements) {
				node_el = find_closest_node_in_array(el, array_path_str);
				if (node_el) break;
			}

			// Pass 2: try ancestor arrays only if same-level found nothing.
			// Skip matches that resolve to the container itself — that just
			// means the pointer is still inside it, not over a sibling.
			if (!node_el) {
				for (const el of elements) {
					for (const ancestor of ancestor_paths) {
						const candidate = find_closest_node_in_array(el, ancestor.str);
						if (!candidate) continue;
						const idx = parseInt(candidate.dataset.path.split('.').at(-1), 10);
						if (idx === ancestor.container_index) break;
						node_el = candidate;
						sel_path = ancestor.path;
						sel_anchor = idx > ancestor.container_index
							? ancestor.container_index
							: ancestor.container_index + 1;
						break;
					}
					if (node_el) break;
				}
			}

			if (node_el) {
				// Expand selection toward the node the pointer is over
				const node_index = parseInt(node_el.dataset.path.split('.').at(-1), 10);
				svedit.session.selection = {
					type: 'node',
					path: sel_path,
					anchor_offset: sel_anchor,
					focus_offset: node_index >= sel_anchor ? node_index + 1 : node_index
				};
			} else if (over_origin) {
				// Back over the starting gap — collapse selection (cancel drag)
				svedit.session.selection = {
					type: 'node',
					path: gap.path,
					anchor_offset: gap.offset,
					focus_offset: gap.offset
				};
			}
			// Over unrelated gaps or empty space — keep current selection as-is
		}

		function on_pointerup() {
			window.removeEventListener('pointermove', on_pointermove);
			window.removeEventListener('pointerup', on_pointerup);
		}

		window.addEventListener('pointermove', on_pointermove);
		window.addEventListener('pointerup', on_pointerup);
	}

	/**
	 * Double-click on an insertion point smoothly scrolls it into view.
	 * @param {MouseEvent} e
	 * @param {{ path: Array<string|number>, offset: number }} gap
	 */
	function handle_insertion_point_dblclick(e, gap) {
		e.preventDefault();
		// Defensive: avoid bubbling into global dblclick/copy handlers.
		e.stopPropagation();
		/** @type {HTMLElement} */ (e.currentTarget).scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

{#if svedit.session.selection?.type === 'property'}
	<div
		class="selected-property-overlay"
		style="position-anchor: --{svedit.session.selection.path.join('-')};"
	></div>
{/if}

{#if selected_node_paths}
	{#each selected_node_paths as path (path.join('-'))}
		<div class="selected-node-overlay" style="position-anchor: --{path.join('-')};"></div>
	{/each}
{/if}

{#if active_link_path}
	<div class="link-action-overlay" style="position-anchor: --{active_link_path.join('-')};">
		<a href={active_link?.href} target="_blank" class="small"><Icon name="external-link" /></a>
	</div>
{/if}

{#each insertion_points as gap (gap.key)}
	<div
		class="insertion-point"
		class:is-active={gap.key === cursor_insertion_point_key}
		class:is-horizontal={gap.is_horizontal}
		class:is-first={gap.offset === 0}
		class:is-middle={gap.offset > 0 && gap.offset < (svedit.session.get(gap.path)?.length ?? 0)}
		class:is-last={gap.offset === (svedit.session.get(gap.path)?.length ?? 0)}
		style={gap.style}
		onpointerdown={(e) => handle_insertion_point_pointerdown(e, gap)}
		ondblclick={(e) => handle_insertion_point_dblclick(e, gap)}
		role="none"
	>
		{#if gap.key === cursor_insertion_point_key}
			<!-- Keep caret inside active insertion point to avoid fragile anchor chaining (Safari). -->
			<div class="insertion-caret"></div>
		{:else}
			<div class="insertion-indicator"></div>
		{/if}
	</div>
{/each}

<style>
	.selected-node-overlay,
	.selected-property-overlay {
		position: absolute;
		background: var(--editing-fill-color);
		border: 1px solid var(--editing-stroke-color);
		border-radius: 2px;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		pointer-events: none;
		z-index: 12;
	}

	.link-action-overlay {
		position: absolute;
		top: anchor(top);
		left: anchor(right);
		pointer-events: auto;
		transform: translateX(var(--s-1)) translateY(-12px);
		z-index: 10;
	}

	.link-action-overlay a {
		background-color: white;
		display: block;
		padding: var(--s-2);
		border-radius: var(--s-2);
		color: var(--primary-text-color);
		--icon-color: var(--primary-text-color);
		box-shadow: var(--shadow-2);
	}

	.insertion-caret {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 20;
		container-type: size;
		animation: cursor-blink 1.1s ease-in-out infinite;
	}

	.insertion-caret::before {
		content: '';
		position: absolute;
		background: var(--caret-color, var(--editing-stroke-color));
		/* Ensure the caret is visible on colored backgrounds */
		box-shadow: 0 0 0 0.5px var(--caret-color-inverted, oklch(1 0 0 / 1));
		border-radius: 1px;
	}

	/* Horizontal caret line for vertical layouts */
	.insertion-point:not(.is-horizontal) > .insertion-caret::before {
		left: 8px;
		right: 8px;
		top: 50%;
		height: 2px;
		transform: translateY(-0.5px);
	}

	/* Vertical caret line for horizontal layouts */
	.insertion-point.is-horizontal > .insertion-caret::before {
		top: 8px;
		bottom: 8px;
		left: 50%;
		width: 2px;
		transform: translateX(-0.5px);
	}

	/* Pause blink while pointer is held down */
	.insertion-point:active > .insertion-caret {
		animation: none;
	}

	@keyframes cursor-blink {
		0%, 60% { opacity: 1; }
		68% { opacity: 0; }
		88% { opacity: 0; }
		100% { opacity: 1; }
	}

	.insertion-point {
		/*
		Design reasoning

		Visual form — centered dashed line with a "+" symbol:

		A single centered line produces far less visual noise than an outline or
		filled region. Outlines create closed shapes that compete with content for
		attention (Gestalt figure/ground); a line stays in the background.

		A dashed stroke reads as "potential" or "draft" — the incompleteness
		signals invitation (Zeigarnik effect: unfinished patterns draw the eye and
		prompt action). Solid lines feel final and closed; dots are too subtle to
		parse at a glance and read as decoration rather than affordance.

		The "+" symbol leverages a near-universal affordance for "add / insert."
		Centered on the line it reads as a single glyph, not a button, keeping
		visual weight low while still communicating interactivity. Together, dash +
		plus form a visual sentence: "something can go here."

		Alignment with insertion-caret:

		Both the insertion indicator and the blinking caret are centered on the same
		axis. When the caret lands on an insertion point, it replaces the dashed line without
		any layout shift — the transition feels like the point "activates" rather
		than something new appearing. This continuity reduces cognitive load during
		navigation (no saccade to a new position, no shape change to re-parse).

		Spacing and containment:

		A subtle inset (padding) makes the insertion-point slightly narrower /
		shorter than neighboring nodes. This margin of white-space signals that the
		insertion point is a liminal zone — "between" content — rather than content itself.
		The asymmetry provides a depth cue: it sits behind the nodes in the
		visual hierarchy, reinforcing that content is primary and insertion points are
		secondary scaffolding.

		Why NOT other approaches:

		- Filled / colored backgrounds add visual noise and clash with node
		  backgrounds, images, or custom user styles.
		- Outline / border creates a rigid box that draws the eye more than the
		  content it separates (figure/ground inversion).
		- Tooltip-only (no visible indicator) fails discoverability — new users
		  wouldn't know gaps are interactive at all.
		- Icon button (floating "+" circle) introduces a new interactive element
		  that needs hover/focus/active states, takes up space, and breaks the
		  principle of the gap being a spatial concept rather than a widget.
		*/
		--gap-color: var(--stroke-color);
		--plus-s: 6px;
		--plus-t: 1px;
		--plus-gap: 9px;
		position: absolute;
		/* hides if anchors haven't been laid out yet */
		position-visibility: anchors-visible;
		min-height: var(--insertion-point-min-size, 8px);
		min-width: var(--insertion-point-min-size, 8px);
		cursor: pointer;
		z-index: 1;
		padding: 2px; /* add some gap so the insertion-point doesn't touch neighboring nodes */
		/* border-radius: 9999px;
		background: oklch(from var(--gap-color) l c h / 0.02);
		background-clip: content-box; */
		/* DO NOT REMOVE THE OUTLINE. it's for debugging */
		/* outline: 0.1px solid red; */
	}

	.insertion-indicator {
		position: absolute;
		inset: 0;
		container-type: size; /* needed for the small insertion-point size query */
	}

	/* Border+mask replaced repeating-gradient stacks that were unstable in Safari. */
	.insertion-indicator::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 6px; /* add some gap so the insertion-point visual doesn't touch e.g. the screen edges */
		right: 6px;
		border-top: 1px dashed var(--gap-color);
		--gap-center: calc(var(--plus-s) / 2 + var(--plus-gap));
		mask-image: linear-gradient(to right,
			black calc(50% - var(--gap-center)),
			transparent calc(50% - var(--gap-center)),
			transparent calc(50% + var(--gap-center)),
			black calc(50% + var(--gap-center)));
	}

	/* Centered plus symbol */
	.insertion-indicator::after {
		content: '';
		position: absolute;
		width: var(--plus-s);
		height: var(--plus-s);
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background:
			linear-gradient(var(--gap-color), var(--gap-color)) center / 100% var(--plus-t) no-repeat,
			linear-gradient(var(--gap-color), var(--gap-color)) center / var(--plus-t) 100% no-repeat;
	}

	/* Small insertion points: dashed outline box */
	@container (width >= 16px) and (height >= 16px) and (width < 48px) and (height < 48px) {
		.insertion-point.is-first.is-last .insertion-caret::before {
			left: 0px;
		}
		.insertion-indicator::before {
			inset: 2px;
			border: 1px dashed var(--gap-color);
			border-radius: 3px;
			mask-image: none;
		}
	}

	/* Horizontal layout: switch line and mask to vertical direction (skip small range for outline box variant) */
	@container ((width >= 48px) or (height >= 48px) or (width < 16px)) {
		.insertion-point.is-horizontal > .insertion-indicator::before {
			top: 6px; /* add some gap so the insertion-point visual doesn't touch e.g. the screen edges */
			bottom: 6px;
			left: 50%;
			right: auto;
			width: 0;
			border-top: none;
			border-left: 1px dashed var(--gap-color);
			mask-image: linear-gradient(to bottom,
				black calc(50% - var(--gap-center)),
				transparent calc(50% - var(--gap-center)),
				transparent calc(50% + var(--gap-center)),
				black calc(50% + var(--gap-center)));
		}
	}
</style>