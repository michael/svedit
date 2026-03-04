<script>
	import { getContext } from 'svelte';

	const DRAG_THRESHOLD_PX = 4;
	const VIEWPORT_OVERSCAN_PX = 600;

	const svedit = getContext('svedit');
	let cursor_gap_key = $derived(get_cursor_gap_key());

	/** @type {Record<string, boolean>} Maps data-path -> true when horizontal */
	let row_layout_cache = $state({});
	let row_layout_ready = $state(false); // Avoid first-frame gap misplacement before cache warmup.
	/** @type {Record<string, boolean>} Maps visible node_array data-path -> true */
	let visible_array_paths = $state({});
	let visible_arrays_ready = $state(false);
	// Raw ref preserves object identity for cheap stale-path checks.
	let visible_paths_doc = $state.raw(null);

	$effect(() => {
		// Re-run when the document changes (doc is $state.raw, new ref on every mutation)
		// This fixes e.g. misplacement of gaps after copy and paste or move commands.
		svedit.session.doc;

		function sync_row_layout_cache() {
			/** @type {Record<string, boolean>} */
			const cache = {};
			for (const el of document.querySelectorAll('[data-type="node_array"]')) {
				const value = getComputedStyle(el)
					.getPropertyValue('--row').trim();
				if (value === '1') {
					cache[/** @type {HTMLElement} */ (el).dataset.path] = true;
				}
			}
			row_layout_cache = cache;
			row_layout_ready = true;
		}
		sync_row_layout_cache();
		window.addEventListener('resize', sync_row_layout_cache);
		return () => window.removeEventListener('resize', sync_row_layout_cache);
	});

	$effect(() => {
		// Re-observe node_array elements whenever DOM structure changes.
		svedit.session.doc;

		if (!svedit.editable) {
			visible_array_paths = {};
			visible_arrays_ready = false;
			visible_paths_doc = null;
			return;
		}

		const visible_path_set = new Set();

		function sync_visible_array_paths() {
			/** @type {Record<string, boolean>} */
			const next_visible_paths = {};
			for (const path of visible_path_set) {
				next_visible_paths[path] = true;
			}
			visible_array_paths = next_visible_paths;
			// These DOM-derived paths belong to this exact doc snapshot.
			visible_paths_doc = svedit.session.doc;
			visible_arrays_ready = true;
		}

		/*
		 * Viewport culling impact measured on a large benchmark document (~1.2k nodes):
		 * - gaps: 1369 -> 248 (top) / 257 (end), about 81% fewer
		 * - DOM nodes: 15018 -> 13897, about 7.5% fewer
		 * - used JS heap: 91.8 MB -> 49.5 MB, about 42 MB (~46%) lower
		 */
		const observer = new IntersectionObserver(
			(entries) => {
				let did_change = false;
				for (const entry of entries) {
					const path = /** @type {HTMLElement} */ (entry.target).dataset.path;
					if (!path) continue;
					if (entry.isIntersecting) {
						if (!visible_path_set.has(path)) {
							visible_path_set.add(path);
							did_change = true;
						}
					} else if (visible_path_set.delete(path)) {
						did_change = true;
					}
				}
				if (did_change) {
					sync_visible_array_paths();
				}
			},
			{
				root: null,
				rootMargin: `${VIEWPORT_OVERSCAN_PX}px`
			}
		);

		for (const element of document.querySelectorAll('[data-type="node_array"][data-path]')) {
			const path = /** @type {HTMLElement} */ (element).dataset.path;
			if (!path) continue;
			const rect = element.getBoundingClientRect();
			const is_within_overscan = (
				rect.bottom >= -VIEWPORT_OVERSCAN_PX &&
				rect.top <= window.innerHeight + VIEWPORT_OVERSCAN_PX &&
				rect.right >= -VIEWPORT_OVERSCAN_PX &&
				rect.left <= window.innerWidth + VIEWPORT_OVERSCAN_PX
			);
			if (is_within_overscan) {
				visible_path_set.add(path);
			}
			observer.observe(element);
		}

		sync_visible_array_paths();
		return () => observer.disconnect();
	});

	let gaps = $derived(build_all_gaps());

	/**
	 * Key of the active gap that should show the blinking cursor.
	 * We track by key (not copied anchor styles) because rendering the cursor as
	 * a child of the active gap is the most robust Safari behavior.
	 * @returns {string | null}
	 */
	function get_cursor_gap_key() {
		const selection = svedit.session.selection;
		if (!selection || selection.type !== 'node') return null;
		if (selection.anchor_offset !== selection.focus_offset) return null;
		return `${selection.path.join('.')}-gap-${selection.anchor_offset}`;
	}

	/**
	 * Build gaps only for viewport-near node arrays.
	 * @returns {Array<{ key: string, path: Array<string|number>, offset: number, type: string, vars: string, is_horizontal: boolean, is_first: boolean, is_last: boolean }>}
	 */
	function build_all_gaps() {
		if (!svedit.editable || !row_layout_ready || !visible_arrays_ready) return [];
		// Skip gap computation while DOM-derived paths still belong to a previous doc snapshot.
		// Prevents tearing errors (e.g. Enter inserts a node, doc updates before observer paths refresh).
		if (visible_paths_doc !== svedit.session.doc) return [];
		const targets = [];
		for (const array_path_str of Object.keys(visible_array_paths)) {
			if (!visible_array_paths[array_path_str]) continue;
			append_array_gaps(array_path_str, targets);
		}
		return targets;
	}

	/**
	 * Convert a data-path key back to a session path.
	 *
	 * We intentionally keep all segments as strings. Path structure should be derived
	 * via session.inspect(path), not by positional or numeric coercion heuristics.
	 *
	 * @param {string} path_key
	 * @returns {Array<string|number>}
	 */
	function parse_path_key(path_key) {
		if (!path_key) return [];
		return path_key.split('.');
	}

	/**
	 * Parent-path extraction for "a.b.c" => "a.b".
	 * @param {string} path_key
	 * @returns {string}
	 */
	function get_parent_path_key(path_key) {
		const delimiter_index = path_key.lastIndexOf('.');
		if (delimiter_index < 0) return '';
		return path_key.slice(0, delimiter_index);
	}

	/**
	 * Parse the last path segment as an integer index.
	 * @param {string} path_key
	 * @returns {number | null}
	 */
	function get_terminal_path_index(path_key) {
		const delimiter_index = path_key.lastIndexOf('.');
		const index_segment =
			delimiter_index < 0 ? path_key : path_key.slice(delimiter_index + 1);
		if (!index_segment) return null;
		const index_value = parseInt(index_segment, 10);
		return Number.isNaN(index_value) ? null : index_value;
	}

	/**
	 * Emit gaps for a specific node_array path.
	 * @param {string} array_path_str
	 * @param {Array<{ key: string, path: Array<string|number>, offset: number, type: string, vars: string, is_horizontal: boolean, is_first: boolean, is_last: boolean }>} targets
	 */
	function append_array_gaps(array_path_str, targets) {
		const array_path = parse_path_key(array_path_str);
		let path_definition = null;
		try {
			path_definition = svedit.session.inspect(array_path);
		} catch {
			return;
		}
		if (path_definition.kind !== 'property' || path_definition.type !== 'node_array') return;
		const node_ids = svedit.session.get(array_path);
		if (!Array.isArray(node_ids)) return;

		const is_horizontal = row_layout_cache[array_path_str] === true;
		const anchor_prefix = `--${array_path.join('-')}`;
		const count = node_ids.length;

		if (count === 0) {
			const anchor = `${anchor_prefix}-0`;
			targets.push({
				key: `${array_path_str}-gap-0`,
				path: array_path,
				offset: 0,
				type: 'gap-empty',
				vars: `--_a:${anchor};--_c:${anchor_prefix}`,
				is_horizontal,
				is_first: true,
				is_last: true
			});
			return;
		}

		const container_anchor = anchor_prefix;
		const ref_first = is_horizontal && count >= 2 ? `${anchor_prefix}-0` : null;
		const ref_second = is_horizontal && count >= 2 ? `${anchor_prefix}-1` : null;

		for (let offset = 0; offset <= count; offset++) {
			const prev = offset > 0 ? `${anchor_prefix}-${offset - 1}` : null;
			const next = offset < count ? `${anchor_prefix}-${offset}` : null;
			if (!prev && !next) continue;
			const is_first = offset === 0;
			const is_last = offset === count;

			let type, vars;
			if (prev && next) {
				type = is_horizontal ? 'gap-row' : 'gap-col';
				vars = is_horizontal && ref_first
					? `--_p:${prev};--_n:${next};--_f:${ref_first};--_s:${ref_second};--_c:${container_anchor}`
					: `--_p:${prev};--_n:${next}`;
			} else if (prev && !next && ref_first) {
				type = 'gap-trail';
				vars = `--_l:${prev};--_f:${ref_first};--_s:${ref_second};--_c:${container_anchor}`;
			} else {
				type = 'gap-edge';
				vars = is_horizontal && is_last && prev
					? `--_a:${prev};--_c:${container_anchor}`
					: `--_a:${prev || next}`;
			}
			targets.push({
				key: `${array_path_str}-gap-${offset}`,
				path: array_path,
				offset,
				type,
				vars,
				is_horizontal,
				is_first,
				is_last
			});
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
			const node_path = node_el.dataset.path;
			if (!node_path) {
				node_el = /** @type {HTMLElement | null} */ (
					node_el.parentElement?.closest('[data-type="node"][data-path]')
				);
				continue;
			}
			const parent_path = get_parent_path_key(node_path);
			if (parent_path === array_path_str) return node_el;
			node_el = /** @type {HTMLElement | null} */ (
				node_el.parentElement?.closest('[data-type="node"][data-path]')
			);
		}
		return null;
	}

	/**
	 * Handle pointerdown on an gap. Sets a collapsed node cursor
	 * immediately, then tracks pointer movement to support drag-selection
	 * across multiple nodes.
	 *
	 * @param {PointerEvent} e
	 * @param {{ path: Array<string|number>, offset: number }} gap
	 * @param {HTMLElement} origin_element
	 */
	function handle_gap_pointerdown(e, gap, origin_element) {
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
		const origin_el = origin_element;
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

			// Pass 0: dragging over gaps should also expand/collapse selection.
			// This avoids requiring the pointer to cross node bodies.
			const gap_data = get_gap_from_hit_elements(elements);
			if (gap_data) {
				const hovered_gap = gap_data.gap;
				const hovered_path_str = hovered_gap.path.join('.');

				if (hovered_path_str === array_path_str) {
					svedit.session.selection = {
						type: 'node',
						path: gap.path,
						anchor_offset: gap.offset,
						focus_offset: hovered_gap.offset
					};
					return;
				}

				for (const ancestor of ancestor_paths) {
					if (hovered_path_str !== ancestor.str) continue;
					const sel_anchor = hovered_gap.offset > ancestor.container_index
						? ancestor.container_index
						: ancestor.container_index + 1;
					svedit.session.selection = {
						type: 'node',
						path: ancestor.path,
						anchor_offset: sel_anchor,
						focus_offset: hovered_gap.offset
					};
					return;
				}
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
			// Skip matches that resolve to the container itself - that just
			// means the pointer is still inside it, not over a sibling.
			if (!node_el) {
				for (const el of elements) {
					for (const ancestor of ancestor_paths) {
						const candidate = find_closest_node_in_array(el, ancestor.str);
						if (!candidate) continue;
						const idx = get_terminal_path_index(candidate.dataset.path);
						if (idx === null) continue;
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
				const node_index = get_terminal_path_index(node_el.dataset.path);
				if (node_index === null) return;
				svedit.session.selection = {
					type: 'node',
					path: sel_path,
					anchor_offset: sel_anchor,
					focus_offset: node_index >= sel_anchor ? node_index + 1 : node_index
				};
			} else if (over_origin) {
				// Back over the starting gap - collapse selection (cancel drag)
				svedit.session.selection = {
					type: 'node',
					path: gap.path,
					anchor_offset: gap.offset,
					focus_offset: gap.offset
				};
			}
			// Over unrelated gaps or empty space - keep current selection as-is
		}

		// Cleanup drag listeners
		function on_pointerup() {
			cleanup_drag_listeners();
		}

		function on_pointercancel() {
			cleanup_drag_listeners();
		}

		function on_window_blur() {
			cleanup_drag_listeners();
		}

		function cleanup_drag_listeners() {
			window.removeEventListener('pointermove', on_pointermove);
			window.removeEventListener('pointerup', on_pointerup);
			window.removeEventListener('pointercancel', on_pointercancel);
			window.removeEventListener('blur', on_window_blur);
		}

		window.addEventListener('pointermove', on_pointermove);
		window.addEventListener('pointerup', on_pointerup);
		window.addEventListener('pointercancel', on_pointercancel);
		window.addEventListener('blur', on_window_blur);
	}

	/**
	 * Find the closest gap element for delegated events.
	 * @param {EventTarget | null} event_target
	 * @returns {HTMLElement | null}
	 */
	function get_gap_element_from_target(event_target) {
		const target = /** @type {Element | null} */ (event_target);
		if (!target?.closest) return null;
		return /** @type {HTMLElement | null} */ (target.closest('.gap[data-index]'));
	}

	/**
	 * Resolve gap data from gap element dataset.
	 * @param {EventTarget | null} event_target
	 * @returns {{ gap: { key: string, path: Array<string|number>, offset: number, type: string, vars: string, is_horizontal: boolean, is_first: boolean, is_last: boolean }, gap_element: HTMLElement } | null}
	 */
	function get_gap_from_target(event_target) {
		const gap_element = get_gap_element_from_target(event_target);
		const index_value = gap_element?.dataset.index;
		if (!index_value) return null;
		const i = parseInt(index_value, 10);
		if (Number.isNaN(i)) return null;
		const gap = gaps[i] ?? null;
		if (!gap) return null;
		return { gap, gap_element };
	}

	/**
	 * Resolve the first rendered gap from an elementsFromPoint() stack.
	 * @param {Array<Element>} hit_elements
	 * @returns {{ gap: { key: string, path: Array<string|number>, offset: number, type: string, vars: string, is_horizontal: boolean, is_first: boolean, is_last: boolean }, gap_element: HTMLElement } | null}
	 */
	function get_gap_from_hit_elements(hit_elements) {
		for (const hit_element of hit_elements) {
			const gap_data = get_gap_from_target(hit_element);
			if (gap_data) return gap_data;
		}
		return null;
	}

	/**
	 * Shared pointerdown handler for gaps.
	 * @param {PointerEvent} e
	 */
	function on_gap_pointerdown(e) {
		const gap_data = get_gap_from_target(e.target);
		if (!gap_data) return;
		handle_gap_pointerdown(e, gap_data.gap, gap_data.gap_element);
	}

	/**
	 * Double-click on an gap smoothly scrolls it into view.
	 * @param {MouseEvent} e
	 * @param {HTMLElement} gap_element
	 */
	function handle_gap_dblclick(e, gap_element) {
		e.preventDefault();
		// Defensive: avoid bubbling into global dblclick/copy handlers.
		e.stopPropagation();
		gap_element.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	/**
	 * Shared double-click handler for gaps.
	 * @param {MouseEvent} e
	 */
	function on_gap_dblclick(e) {
		const gap_data = get_gap_from_target(e.target);
		if (!gap_data) return;
		handle_gap_dblclick(e, gap_data.gap_element);
	}
</script>

<div class="gaps-layer" onpointerdown={on_gap_pointerdown} ondblclick={on_gap_dblclick} role="none">
	{#each gaps as gap, i (gap.key)}
		<div
			class="gap {gap.type}"
			data-index={i}
			class:active={gap.key === cursor_gap_key}
			class:row={gap.is_horizontal}
			class:first={gap.is_first}
			class:last={gap.is_last}
			style={gap.vars}
			role="none"
		></div>
		<div
			class="gap-marker {gap.type}"
			class:active={gap.key === cursor_gap_key}
			class:row={gap.is_horizontal}
			class:first={gap.is_first}
			class:last={gap.is_last}
			style={gap.vars}
		>
			{#if gap.key === cursor_gap_key}
				<!-- Keep caret inside active gap to avoid fragile anchor chaining (Safari). -->
				<div class="caret"></div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.caret {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 20;
		container-type: size;
		animation: cursor-blink 1.1s ease-in-out infinite;
	}

	.caret::before {
		content: '';
		position: absolute;
		background: var(--caret-color, var(--editing-stroke-color));
		/* Ensure the caret is visible on colored backgrounds */
		box-shadow: 0 0 0 0.5px var(--caret-color-inverted, oklch(1 0 0 / 1));
		border-radius: 1px;
	}

	/* Horizontal caret line for vertical layouts. */
	.gap-marker:not(.row) > .caret::before {
		left: var(--marker-inset);
		right: var(--marker-inset);
		top: 50%;
		height: 2px;
		transform: translateY(-0.5px);
	}

	/* Vertical caret line for horizontal layouts. */
	.gap-marker.row > .caret::before {
		top: var(--marker-inset);
		bottom: var(--marker-inset);
		left: 50%;
		width: 2px;
		transform: translateX(-0.5px);
	}

	/* Pause blink while pointer is held down */
	.gap:active + .gap-marker > .caret {
		animation: none;
	}

	@keyframes cursor-blink {
		0%, 60% { opacity: 1; }
		68% { opacity: 0; }
		88% { opacity: 0; }
		100% { opacity: 1; }
	}

	.gap, .gap-marker {
		--edge-gap: 24px;
		--wrap-marker-width: var(--gap-min-size, 16px);
	}
	/*
	 * Edge gap - before-first or after-last element.
	 * 24 px strip adjacent to the anchor, spanning its cross-axis.
	 */

	/*
	 * Hit area element - handles pointer events, defines the clickable region.
	 */
	.gap {
		/*
		Design reasoning

		Visual form - centered dashed line with a "+" symbol:

		A single centered line produces far less visual noise than an outline or
		filled region. Outlines create closed shapes that compete with content for
		attention (Gestalt figure/ground); a line stays in the background.

		A dashed stroke reads as "potential" or "draft" - the incompleteness
		signals invitation (Zeigarnik effect: unfinished patterns draw the eye and
		prompt action). Solid lines feel final and closed; dots are too subtle to
		parse at a glance and read as decoration rather than affordance.

		The "+" symbol leverages a near-universal affordance for "add / insert."
		Centered on the line it reads as a single glyph, not a button, keeping
		visual weight low while still communicating interactivity. Together, dash +
		plus form a visual sentence: "something can go here."

		Alignment with caret:

		Both the insertion indicator and the blinking caret are centered on the same
		axis. When the caret lands on an gap, it replaces the dashed line without
		any layout shift - the transition feels like the point "activates" rather
		than something new appearing. This continuity reduces cognitive load during
		navigation (no saccade to a new position, no shape change to re-parse).

		Spacing and containment:

		A subtle inset (padding) makes the gap slightly narrower /
		shorter than neighboring nodes. This margin of white-space signals that the
		gap is a liminal zone - "between" content - rather than content itself.
		The asymmetry provides a depth cue: it sits behind the nodes in the
		visual hierarchy, reinforcing that content is primary and gaps are
		secondary scaffolding.

		Why NOT other approaches:

		- Filled / colored backgrounds add visual noise and clash with node
		  backgrounds, images, or custom user styles.
		- Outline / border creates a rigid box that draws the eye more than the
		  content it separates (figure/ground inversion).
		- Tooltip-only (no visible indicator) fails discoverability - new users
		  wouldn't know gaps are interactive at all.
		- Icon button (floating "+" circle) introduces a new interactive element
		  that needs hover/focus/active states, takes up space, and breaks the
		  principle of the gap being a spatial concept rather than a widget.
		*/
		--gap-color: var(--stroke-color);
		--plus-s: 6px;
		--plus-t: 1px;
		--plus-gap: 1px;
		--marker-inset: 2px;
		position: absolute;
		/* hides if anchors haven't been laid out yet */
		position-visibility: anchors-visible;
		min-height: var(--gap-min-size, 16px);
		min-width: var(--gap-min-size, 16px);
		cursor: pointer;
		z-index: 1;
		padding: 2px; /* add some gap so the gap doesn't touch neighboring nodes */
		container-type: size;
	}

	/*
	 * Visual marker element - sibling of the hit area, shares the same
	 * containing block so anchor() resolves correctly on it.
	 *
	 * For same-line gaps: identical position to the hit area -> 50% centers the marker.
	 * For line-end gaps: narrowed to max(ref_gap, min_size) via anchor() overrides
	 * on its own right property -> 50% = half the reference gap, visually aligned
	 * with between-node markers.
	 */
	.gap-marker {
		--gap-color: var(--stroke-color);
		--plus-s: 6px;
		--plus-t: 1px;
		--plus-gap: 4px;
		--marker-inset: 2px;
		position: absolute;
		position-visibility: anchors-visible;
		pointer-events: none;
		z-index: 2;
		padding: 2px;
	}

	/*
	 * Anchor-positioning rules for each gap type.
	 *
	 * Architecture: each gap produces TWO sibling elements:
	 *   .gap - the invisible click target (hit area)
	 *   .gap-marker       - the visible dashed line + plus symbol
	 *
	 * Both carry the type class (gap-empty, gap-col, gap-row, gap-edge, gap-trail),
	 * so the base positioning rules below apply to both identically.
	 * The gap-marker then overrides only the `right` property for line-end
	 * gaps, narrowing itself to max(ref_gap, min_size) so that the 50%
	 * midpoint (where ::before/::after draw the visual) aligns with
	 * between-node markers.
	 *
	 * Anchor CSS custom properties (set via inline style on each element):
	 *   --_a  anchor   (the node this gap is adjacent to - empty / edge)
	 *   --_p  prev     (the node before this gap - col / row)
	 *   --_n  next     (the node after this gap - col / row)
	 *   --_l  last     (the last node in the array - trailing row)
	 *   --_f  first    (reference item 0 - for measuring inter-node gap)
	 *   --_s  second   (reference item 1 - for measuring inter-node gap)
	 *   --_c  container (the node-array container)
	 *
	 * Edge clamping strategy:
	 *   When a node array has no padding/margin, gaps at the
	 *   edges extend past .svedit (the containing block). To keep them
	 *   visible:
	 *     - Outward insets use max(0px, ...) to clamp to the CB edge
	 *     - Opposite insets use min(..., 100% - edge-gap) to guarantee
	 *       minimum width/height, causing an inward shift rather than shrink
	 *     - min-width/min-height on .gap-edge cooperates with over-constrained
	 *       insets to achieve shift behavior in LTR (left takes precedence)
	 */

	/* Empty array - marker covers the placeholder, hit area fills the container.
	   --_a is the placeholder element; --_c is the node-array container. */
	.gap-empty {
		top: anchor(var(--_a) top);
		left: anchor(var(--_a) left);
		bottom: anchor(var(--_a) bottom);
		right: anchor(var(--_a) right);
	}
	.gap-empty.row {
		/* Ensure minimum edge-gap width even when the placeholder is narrow */
		right: max(anchor(var(--_a) right), calc(anchor(var(--_a) left) - var(--edge-gap)));
	}

	/* Hit area expands to fill the full container. Uses min() on each inset to
	   take the outermost edge of either the placeholder or the container. This
	   handles collapsed containers (when the placeholder has position: absolute,
	   the container can collapse to zero height). */
	.gap.gap-empty {
		top: min(anchor(var(--_a) top), anchor(var(--_c) top));
		left: min(anchor(var(--_a) left), anchor(var(--_c) left));
		bottom: min(anchor(var(--_a) bottom), anchor(var(--_c) bottom));
		right: min(anchor(var(--_a) right), anchor(var(--_c) right));
	}

	/*
	 * Column gap - between two siblings in a vertical layout.
	 * min() on top/bottom ensures an 8 px min-height centered on the midpoint.
	 */
	.gap-col {
		top: min(
			anchor(var(--_p) bottom),
			calc((anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--gap-min-size, 16px) / 2)
		);
		bottom: min(
			anchor(var(--_n) top),
			calc((anchor(var(--_p) bottom) + anchor(var(--_n) top)) / 2
				- var(--gap-min-size, 16px) / 2)
		);
		left: min(anchor(var(--_p) right), anchor(var(--_n) left));
		right: min(anchor(var(--_p) right), anchor(var(--_n) left));
	}

	/*
	 * Row gap - between two siblings in a horizontal layout.
	 *
	 * This rule handles BOTH same-line gaps and wrapped line-end gaps using
	 * pure CSS math with a * 999 multiplier trick for wrap detection:
	 *
	 *   Same line (prev.right < next.left):
	 *     The gap between prev and next is positive. The * 999 term in left
	 *     explodes to a huge value, disqualifying that min() branch. Result:
	 *     centered between prev.right and next.left with min-size guarantee.
	 *
	 *   Wrapped (prev.right > next.left - next is on the line below):
	 *     The gap is negative, so max(0, gap) * 999 = 0, and the third left
	 *     term wins: offset by half the reference gap (measured between items
	 *     0 and 1 via --_f/--_s) to visually align with between-node markers.
	 *     Right extends edge-gap past the container for a large click target.
	 *
	 * Edge clamping (last two terms):
	 *   left: min(..., 100% - edge-gap) ensures the box is at least edge-gap
	 *         wide when the right edge is clamped to 0.
	 *   right: max(0px, ...) prevents the box from extending past the
	 *          containing block (.svedit), keeping it visible on screen.
	 */
	.gap-row {
		top: anchor(var(--_p) top);
		bottom: anchor(var(--_p) bottom);
		left: min(
			/* Fallback: start at prev.right (always valid) */
			anchor(var(--_p) right),
			/* Same-line: center between prev and next with min-size guarantee.
			   max(0, prev.right - next.left) * 999 explodes when on the same line
			   (gap is positive -> huge offset disqualifies this branch via min). */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--gap-min-size, 16px) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 999
			),
			/* Edge clamp: keep left <= CB width - edge-gap so the box has at
			   least edge-gap width when right is clamped to 0 at screen edge */
			calc(100% - var(--edge-gap))
		);
		right: max(0px, min(
			/* Same-line: right edge at next.left */
			anchor(var(--_n) left),
			/* Same-line centering from the right side */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--gap-min-size, 16px) / 2
			),
			/* Wrapped: extends edge-gap past the container (large click target).
			   The * 999 term locks this branch off when on the same line. */
			max(
				min(
					calc(anchor(var(--_c) right) - var(--edge-gap)),
					calc(anchor(var(--_p) right) - var(--edge-gap))
				),
				calc(
					anchor(var(--_p) right)
						- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 999
				)
			)
		));
	}

	/*
	 * Edge gaps - before the first or after the last item in an array.
	 *
	 * These extend outward from the boundary node by --edge-gap. When the
	 * array is flush with the screen edge (no padding), the outward extension
	 * would be off-screen. Two CSS tricks fix this:
	 *
	 *   max(0px, ...) on the outward inset - clamps the box to the containing
	 *   block edge (0 = .svedit's left/top).
	 *
	 *   min(..., 100% - edge-gap) on the opposite inset - ensures the box
	 *   stays at least edge-gap wide/tall even when the outward edge clamps
	 *   to 0. In LTR, left takes precedence over right in over-constrained
	 *   layouts, so min-width + clamped left = rightward shift. For right/
	 *   bottom edges where the element would grow the wrong way, the min()
	 *   on the opposite inset forces the shift direction instead.
	 *
	 * min-width/min-height on .gap-edge cooperates with the clamped inset:
	 * when the outward inset is 0 and the opposite inset is close, the
	 * browser resolves the over-constraint by adjusting the non-dominant
	 * inset, effectively shifting the box inward.
	 */
	.gap-edge {
		min-height: var(--edge-gap);
		min-width: var(--edge-gap);
	}
	.gap-marker.gap-edge {
		min-height: var(--wrap-marker-width);
		min-width: var(--wrap-marker-width);
	}
	.gap-edge.row {
		top: anchor(var(--_a) top);
		bottom: anchor(var(--_a) bottom);
	}
	.gap-edge:not(.row) {
		left: anchor(var(--_a) left);
		right: anchor(var(--_a) right);
	}
	/* First horizontal edge: extends left of node, clamped to CB left. */
	.gap-edge.row.first {
		right: anchor(var(--_a) left);
		left: max(0px, calc(anchor(var(--_a) left) - var(--edge-gap)));
	}
	/* Last horizontal edge: extends right of node, clamped to CB right.
	   left is capped at 100% - edge-gap to guarantee minimum width. */
	.gap-edge.row.last {
		left: min(anchor(var(--_a) right), calc(100% - var(--edge-gap)));
		right: max(0px, min(
			anchor(var(--_c) right),
			calc(anchor(var(--_a) right) - var(--edge-gap))
		));
	}
	/* First vertical edge: extends above the first node. */
	.gap-edge:not(.row).first {
		bottom: anchor(var(--_a) top);
		top: max(0px, calc(anchor(var(--_a) top) - var(--edge-gap)));
	}
	/* Last vertical edge: extends below the last node. */
	.gap-edge:not(.row).last {
		top: anchor(var(--_a) bottom);
		bottom: calc(anchor(var(--_a) bottom) - var(--edge-gap));
	}

	/*
	 * Trailing row gap - after the last item in a horizontal layout (>= 2 items).
	 * Always a line-end: extends from last.right toward the container edge.
	 *
	 * Left offset uses the same ref-gap centering as gap-row wrapped, so the
	 * dashed marker line at 50% aligns with between-node markers across rows.
	 *
	 * Right extends edge-gap past the container for a large click target.
	 * max(0px, ...) prevents overflow past the containing block (.svedit).
	 * The left min(..., 100% - edge-gap) term ensures minimum width when right
	 * clamps to 0 at the screen edge.
	 */
	.gap-trail {
		top: anchor(var(--_l) top);
		bottom: anchor(var(--_l) bottom);
		left: min(
			/* Fallback: start at last.right */
			anchor(var(--_l) right),
			/* Centering offset: shift right by half ref_gap minus half
			   max(ref_gap, min_size). Aligns the 50% marker line with
			   between-node markers. ref_gap = item1.left - item0.right. */
			calc(
				anchor(var(--_l) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--gap-min-size, 16px)
				) / 2
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
			),
			/* Edge clamp: minimum width guarantee at screen edge */
			calc(100% - var(--edge-gap))
		);
		right: max(0px, min(
			calc(anchor(var(--_c) right) - var(--edge-gap)),
			calc(anchor(var(--_l) right) - var(--edge-gap))
		));
	}

	/* gap-trail marker: narrowed to max(ref_gap, min_size) so the 50% marker
	   line aligns with between-node markers. Capped at the container edge.
	   The right-coordinate ref_gap = anchor(--_f right) - anchor(--_s left)
	   = second.left - first.right (positive in right-edge coordinates).
	   max() picks the most constrained (largest) right value:
	     - 0px: edge clamp, prevents overflow past .svedit
	     - centering formula: narrows the marker to ref-gap-aligned width
	     - container cap: prevents excessive overflow beyond the array */
	.gap-marker.gap-trail.last {
		left: min(
			/* Fallback: start at last.right */
			anchor(var(--_l) right),
			/* Centering offset: shift right by half ref_gap minus half
			   max(ref_gap, min_size). Aligns the 50% marker line with
			   between-node markers. ref_gap = item1.left - item0.right. */
			calc(
				anchor(var(--_l) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--gap-min-size, 16px)
				) / 2
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
			),
			/* Clamp 1: basic minimum width guarantee at screen edge */
			calc(100% - var(--wrap-marker-width)),
			/* Clamp 2: enforces ref_gap width, but explodes and gets ignored
			   if space_available < ref_gap. */
			calc(
				100% - max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--gap-min-size, 16px)
				)
				+ max(0px,
					(max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)))
					- (anchor(var(--_c) right) - anchor(var(--_l) right))
					- 0.5px
				) * 9999
			)
		);
		right: max(
			0px,
			/* Branch 1: normal ref_gap width */
			calc(
				anchor(var(--_l) right)
				- (
					max(0px, anchor(var(--_f) right) - anchor(var(--_s) left))
					+ max(
						max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)),
						var(--gap-min-size, 16px)
					)
				) / 2
				- max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)) * 9999
			),
			/* Branch 2: snap to wrap-marker-width if space is tight. */
			calc(
				anchor(var(--_l) right) - var(--wrap-marker-width)
				- max(0px,
					(anchor(var(--_l) right) - anchor(var(--_c) right))
					- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
					+ 0.5px
				) * 9999
			),
			/* Branch 3: fixed wrap-marker-width when completely wrapped (ref_gap = 0).
			   Explodes if there is a gap (ref_gap > 0). */
			calc(
				anchor(var(--_l) right) - var(--wrap-marker-width)
				- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
			),
			/* container cap */
			min(
				anchor(var(--_c) right),
				calc(anchor(var(--_l) right) - var(--edge-gap))
			)
		);
	}

	/*
	 * gap-marker narrowing for line-end types.
	 *
	 * The gap-marker inherits top/bottom/left from the shared type rules above,
	 * then overrides right to narrow itself to max(ref_gap, min_size).
	 *
	 * Why this works for visual alignment:
	 *   Between-node markers are centered in the gap, so their 50% point
	 *   (where the dashed line draws) is at gap/2 from each node edge.
	 *   Line-end markers are narrowed to the same max(ref_gap, min_size)
	 *   width, so their 50% point is also at ref_gap/2 from the node edge.
	 *   Result: all marker lines align on the same x-axis across rows.
	 *
	 * In the right property (right-edge coordinate system):
	 *   ref_gap = anchor(--_f right) - anchor(--_s left)
	 *           = (CB_right - first.right) - (CB_right - second.left)
	 *           = second.left - first.right  (positive value)
	 *
	 * All marker right overrides include max(0px, ...) or a 0px term to
	 * prevent the marker from extending past .svedit at screen edges.
	 */

	/* gap-row marker: same-line gaps keep full width; wrapped line-ends mirror gap-trail
	   behavior, filling the inner gap width if space permits, or narrowing to
	   wrap-marker-width at the screen edges.
	   Outer max(0px, ...) prevents overflow past .svedit at screen edges. */
	.gap-marker.gap-row {
		left: min(
			/* Fallback: start at prev.right (always valid) */
			anchor(var(--_p) right),
			/* Same-line: center between prev and next with min-size guarantee.
			   max(0, prev.right - next.left) * 9999 explodes when wrapped
			   (gap is positive -> huge offset disqualifies this branch via min). */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--gap-min-size, 16px) / 2
				+ max(0px, anchor(var(--_p) right) - anchor(var(--_n) left)) * 9999
			),
			/* Wrapped centering offset: shift right by half ref_gap minus half
			   max(ref_gap, min_size). Aligns the 50% marker line with
			   between-node markers. Explodes if on the same line. */
			calc(
				anchor(var(--_p) right)
				+ (max(0px, anchor(var(--_s) left) - anchor(var(--_f) right))) / 2
				- max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--gap-min-size, 16px)
				) / 2
				+ max(0px, anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
				+ max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
			),
			/* Clamp 1: basic minimum width guarantee at screen edge */
			calc(100% - var(--wrap-marker-width)),
			/* Clamp 2: enforces ref_gap width, but explodes and gets ignored
			   if space_available < ref_gap OR if on the same line. */
			calc(
				100% - max(
					max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)),
					var(--gap-min-size, 16px)
				)
				+ max(0px,
					(max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)))
					- (anchor(var(--_c) right) - anchor(var(--_p) right))
					- 0.5px
				) * 9999
				+ max(0px, anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
			)
		);
		right: max(0px, min(
			/* Same-line: right at next.left (full width between nodes) */
			anchor(var(--_n) left),
			/* Same-line centering from the right side */
			calc(
				(anchor(var(--_p) right) + anchor(var(--_n) left)) / 2
				- var(--gap-min-size, 16px) / 2
			),
			/* Wrapped: inner max() picks the most constrained value. */
			max(
				/* Branch 1: normal ref_gap width */
				calc(
					anchor(var(--_p) right)
					- (
						max(0px, anchor(var(--_f) right) - anchor(var(--_s) left))
						+ max(
							max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)),
							var(--gap-min-size, 16px)
						)
					) / 2
					- max(0px, anchor(var(--_s) left) - anchor(var(--_f) right)) * 9999
				),
				/* Branch 2: snap to wrap-marker-width if space is tight */
				calc(
					anchor(var(--_p) right) - var(--wrap-marker-width)
					- max(0px,
						(anchor(var(--_p) right) - anchor(var(--_c) right))
						- (max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)))
						+ 0.5px
					) * 9999
				),
				/* Branch 3: fixed wrap-marker-width when completely wrapped (ref_gap = 0).
				   Explodes if there is a gap (ref_gap > 0). */
				calc(
					anchor(var(--_p) right) - var(--wrap-marker-width)
					- max(0px, anchor(var(--_f) right) - anchor(var(--_s) left)) * 9999
				),
				/* Branch 3: explodes (huge positive) if on same line, forcing outer min() to ignore this max() */
				calc(
					anchor(var(--_p) right)
					- (anchor(var(--_n) left) - anchor(var(--_p) right)) * 9999
				),
				/* container cap */
				min(
					anchor(var(--_c) right),
					calc(anchor(var(--_p) right) - var(--edge-gap))
				)
			)
		));
	}

	/*
	 * gap-marker narrowing for edge gaps.
	 * The hit area remains var(--edge-gap) wide, but the visual marker
	 * shrinks to var(--wrap-marker-width) so it stays close to the node.
	 */
	.gap-marker.gap-edge.row.first {
		left: max(0px, calc(anchor(var(--_a) left) - var(--wrap-marker-width)));
	}
	.gap-marker.gap-edge.row.last {
		left: min(anchor(var(--_a) right), calc(100% - var(--wrap-marker-width)));
		right: max(
			0px,
			calc(anchor(var(--_a) right) - var(--wrap-marker-width)),
			anchor(var(--_c) right)
		);
	}
	.gap-marker.gap-edge:not(.row).first {
		top: max(0px, calc(anchor(var(--_a) top) - var(--wrap-marker-width)));
	}
	.gap-marker.gap-edge:not(.row).last {
		bottom: calc(anchor(var(--_a) bottom) - var(--wrap-marker-width));
	}

	/* Empty horizontal: caret at the left boundary */
	.gap-marker.gap-empty.row > .caret::before {
		left: 0;
	}

	/* Dashed line marker (vertical-layout default: horizontal line). */
	.gap-marker:not(.active)::before {
		content: '';
		position: absolute;
		top: 50%;
		left: var(--marker-inset);
		right: var(--marker-inset);
		border-top: 1px dashed var(--gap-color);
		transform: translateY(-0.5px);
		--gap-center: calc(var(--plus-s) / 2 + var(--plus-gap));
		mask-image: linear-gradient(to right,
			black calc(50% - var(--gap-center)),
			transparent calc(50% - var(--gap-center)),
			transparent calc(50% + var(--gap-center)),
			black calc(50% + var(--gap-center)));
	}

	/* Centered plus symbol. */
	.gap-marker:not(.active)::after {
		content: '';
		position: absolute;
		width: var(--plus-s);
		height: var(--plus-s);
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--gap-color);
		mask-image:
			linear-gradient(black, black),
			linear-gradient(black, black);
		mask-size:
			100% var(--plus-t),
			var(--plus-t) 100%;
		mask-position: center;
		mask-repeat: no-repeat;
		/* Use mask-composite to combine the lines, preventing the background from
		   drawing twice if it has opacity, though masking a solid background color
		   already inherently prevents double-opacity overlap anyway. */
	}

	/* Horizontal layout: vertical dashed line. */
	.gap-marker.row:not(.active):not(.gap-empty)::before {
		top: var(--marker-inset);
		bottom: var(--marker-inset);
		left: 50%;
		right: auto;
		width: 0;
		border-top: none;
		border-left: 1px dashed var(--gap-color);
		transform: translateX(-0.5px);
		mask-image: linear-gradient(to bottom,
			black calc(50% - var(--gap-center)),
			transparent calc(50% - var(--gap-center)),
			transparent calc(50% + var(--gap-center)),
			black calc(50% + var(--gap-center)));
	}

	/* @container (width >= 16px) and (height >= 16px) and (width < 48px) and (height < 48px) { */
		/*
		 * Tiny empty arrays: dashed outline for discoverability.
		 * Drawn on .gap::before (not .gap-marker) because the
		 * @container query needs an ancestor with container-type: size,
		 * and .gap is the only one that qualifies.
		 */
		.gap-marker.gap-empty:not(.active)::before {
			inset: 0px;
			border: 1px dashed var(--gap-color);
			border-radius: 3px;
			mask-image: none;
			transform: none;
		}
	/* } */

	/* Debugging styles */
	:global([data-type="node_array"]) {
		outline: 0.1px solid green;
	}
	.gap {
		outline: 0.1px solid red;
	}
	.gap-marker {
		outline: 0.1px solid blue;
		outline-offset: -2px;
	}
</style>
