<script>
	import { getContext } from 'svelte';
	import Icon from './Icon.svelte';

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
	 * @returns {Array<{ key: string, path: Array<string|number>, offset: number, type: string, vars: string, is_horizontal: boolean }>}
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
	 * @param {Array<{ key: string, path: Array<string|number>, offset: number, type: string, vars: string, is_horizontal: boolean }>} targets
	 */
	function collect_insertion_points(node_path, targets) {
		const node = svedit.session.get(node_path);
		if (!node || typeof node !== 'object') return;

		const schema = svedit.session.schema[node.type];
		if (!schema?.properties) return;

		for (const [prop_name, prop_def] of Object.entries(schema.properties)) {

			// Recurse into single node properties (e.g. nav, footer) to find nested node_arrays 
			if (prop_def.type === 'node') {
				collect_insertion_points([...node_path, prop_name], targets);
				continue;
			}

			if (prop_def.type !== 'node_array') continue;
			const array_path = [...node_path, prop_name];
			const node_ids = svedit.session.get(array_path);
			if (!Array.isArray(node_ids)) continue;
			const is_horizontal = orientation_cache[array_path.join('.')] === true;

			const count = node_ids.length;

		if (count === 0) {
			const anchor = `--${[...array_path, 0].join('-')}`;
			targets.push({
				key: `${array_path.join('.')}-gap-0`,
				path: array_path,
				offset: 0,
				type: 'ip-empty',
				vars: `--_a: ${anchor}`,
				is_horizontal
			});
			continue;
		}

		const container_anchor = `--${array_path.join('-')}`;
		const ref_first = is_horizontal && count >= 2 ? `--${[...array_path, 0].join('-')}` : null;
		const ref_second = is_horizontal && count >= 2 ? `--${[...array_path, 1].join('-')}` : null;

		for (let offset = 0; offset <= count; offset++) {
			const prev = offset > 0 ? `--${[...array_path, offset - 1].join('-')}` : null;
			const next = offset < count ? `--${[...array_path, offset].join('-')}` : null;
			if (!prev && !next) continue;

			let type, vars;
			if (prev && next) {
				type = is_horizontal ? 'ip-row' : 'ip-col';
				vars = `--_p: ${prev}; --_n: ${next}`;
			} else if (prev && !next && ref_first) {
				type = 'ip-trail';
				vars = `--_l: ${prev}; --_f: ${ref_first}; --_s: ${ref_second}; --_c: ${container_anchor}`;
			} else {
				type = 'ip-edge';
				vars = `--_a: ${prev || next}`;
			}
			targets.push({
				key: `${array_path.join('.')}-gap-${offset}`,
				path: array_path,
				offset,
				type,
				vars,
				is_horizontal
			});
		}

			for (let i = 0; i < count; i++) {
				collect_insertion_points([...array_path, i], targets);
			}
		}
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
				container_index: parseInt(String(gap.path[len]), 10)
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
		class="insertion-point {gap.type}"
		class:is-active={gap.key === cursor_insertion_point_key}
		class:is-horizontal={gap.is_horizontal}
		class:is-first={gap.offset === 0}
		class:is-middle={gap.offset > 0 && gap.offset < (svedit.session.get(gap.path)?.length ?? 0)}
		class:is-last={gap.offset === (svedit.session.get(gap.path)?.length ?? 0)}
		style={gap.vars}
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
		outline: 1px solid red;
	}

	/*
	 * Anchor-positioning rules for each insertion-point type.
	 *
	 * Instead of building massive inline style strings, each type class
	 * defines the anchor() formulas once, referencing concise CSS custom
	 * properties set as inline vars on each element:
	 *
	 *   --_a  anchor   (empty / edge)
	 *   --_p  prev     (col / row gap)
	 *   --_n  next     (col / row gap)
	 *   --_l  last     (trailing row)
	 *   --_f  first    (trailing row — reference item 0)
	 *   --_s  second   (trailing row — reference item 1)
	 *   --_c  container(trailing row)
	 */

	/* Empty array — cover the placeholder anchor entirely */
	.ip-empty {
		top: anchor(var(--_a) top);
		left: anchor(var(--_a) left);
		bottom: anchor(var(--_a) bottom);
		right: anchor(var(--_a) right);
	}

	/*
	 * Column gap — between two siblings in a vertical layout.
	 * min() on top/bottom ensures an 8 px min-height centered on the midpoint.
	 */
	.ip-col {
		top: min(
			anchor(var(--_p) bottom),
			calc((anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--insertion-point-min-size, 8px) / 2)
		);
		bottom: min(
			anchor(var(--_n) top),
			calc((anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--insertion-point-min-size, 8px) / 2)
		);
		left: min(anchor(var(--_p) right), anchor(var(--_n) left));
		right: min(anchor(var(--_p) right), anchor(var(--_n) left));
	}

	/*
	 * Row gap — between two siblings in a horizontal layout.
	 * Uses * 999 multiplier tricks for wrap detection:
	 *   same line  → centered between prev.right and next.left
	 *   wrapped    → 24 px edge strip to the right of prev
	 */
	.ip-row {
		--edge-gap: 24px;
		top: anchor(var(--_p) top);
		bottom: anchor(var(--_p) bottom);
		left: min(
			anchor(var(--_p) right),
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--insertion-point-min-size, 8px) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 999
			)
		);
		right: min(
			anchor(var(--_n) left),
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--insertion-point-min-size, 8px) / 2
			),
			max(
				anchor(var(--_p) right) - var(--edge-gap),
				anchor(var(--_p) right)
					- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 999
			)
		);
	}

	/*
	 * Edge gap — before-first or after-last element.
	 * 24 px strip adjacent to the anchor, spanning its cross-axis.
	 * The 4 variants (before/after × horizontal/vertical) are selected
	 * by combining with .is-first/.is-last and .is-horizontal.
	 */
	.ip-edge {
		--edge-gap: 24px;
		min-height: var(--edge-gap);
		min-width: var(--edge-gap);
	}
	.ip-edge.is-horizontal {
		top: anchor(var(--_a) top);
		bottom: anchor(var(--_a) bottom);
	}
	.ip-edge:not(.is-horizontal) {
		left: anchor(var(--_a) left);
		right: anchor(var(--_a) right);
	}
	.ip-edge.is-horizontal.is-first {
		right: anchor(var(--_a) left);
		left: calc(anchor(var(--_a) left) - var(--edge-gap));
	}
	.ip-edge.is-horizontal.is-last {
		left: anchor(var(--_a) right);
		right: calc(anchor(var(--_a) right) - var(--edge-gap));
	}
	.ip-edge:not(.is-horizontal).is-first {
		bottom: anchor(var(--_a) top);
		top: calc(anchor(var(--_a) top) - var(--edge-gap));
	}
	.ip-edge:not(.is-horizontal).is-last {
		top: anchor(var(--_a) bottom);
		bottom: calc(anchor(var(--_a) bottom) - var(--edge-gap));
	}

	/*
	 * Trailing row gap — after the last item in a horizontal layout (≥ 2 items).
	 *
	 * Two modes selected via * 999 multiplier tricks:
	 *   partial row → gap-centered insertion point (gap derived from items 0–1)
	 *   full row    → 24 px edge strip flush to last item's trailing edge
	 *
	 * Detection: remaining space from last item to container edge vs threshold.
	 * anchor() resolves differently in left vs right properties, so separate
	 * formulas produce the same logical result in each coordinate system.
	 */
	.ip-trail {
		--edge-gap: 24px;
		top: anchor(var(--_l) top);
		bottom: anchor(var(--_l) bottom);
		left: min(
			calc(
				anchor(var(--_l) right)
				+ (anchor(var(--_s) left) - anchor(var(--_f) right)) / 2
				- max(
					(anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--insertion-point-min-size, 8px)
				) / 2
				+ max(0px,
					max(
						(anchor(var(--_f) right) - anchor(var(--_s) left)),
						var(--edge-gap)
					) - (anchor(var(--_c) right) - anchor(var(--_l) right))
				) * 999
			),
			calc(
				anchor(var(--_l) right)
				+ max(0px,
					(anchor(var(--_c) right) - anchor(var(--_l) right))
					- max(
						(anchor(var(--_f) right) - anchor(var(--_s) left)),
						var(--edge-gap)
					)
				) * 999
			)
		);
		right: max(
			calc(
				anchor(var(--_l) right)
				- (anchor(var(--_f) right) - anchor(var(--_s) left)) / 2
				- max(
					(anchor(var(--_f) right) - anchor(var(--_s) left)),
					var(--insertion-point-min-size, 8px)
				) / 2
				- max(0px,
					max(
						(anchor(var(--_f) right) - anchor(var(--_s) left)),
						var(--edge-gap)
					) - (anchor(var(--_l) right) - anchor(var(--_c) right))
				) * 999
			),
			calc(
				anchor(var(--_l) right) - var(--edge-gap)
				- max(0px,
					(anchor(var(--_l) right) - anchor(var(--_c) right))
					- max(
						(anchor(var(--_f) right) - anchor(var(--_s) left)),
						var(--edge-gap)
					)
				) * 999
			)
		);
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