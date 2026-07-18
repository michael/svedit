<script lang="ts">
	import { serialize_path } from 'svedit';
	import type { DocumentNode, DocumentPath } from 'svedit';
	import { get_node_layouts, get_selection_node_ancestors } from '../app_utils.js';
	import type { AppSession } from '../demo_session.js';

	type VariantOption = { layout: string | null; value: string };
	type VariantGroup = { node_type: string; options: VariantOption[] };
	type VariantItem = {
		node: DocumentNode;
		path: DocumentPath;
		is_type_target: boolean;
		is_layout_target: boolean;
		current_value: string;
		label: string;
		type_label: string;
		layout_label: string;
		groups: VariantGroup[];
		option_count: number;
	};
	type SwitchableState = { node_array_path: DocumentPath; node_index: number } | null;

	let { session, focus_canvas }: { session: AppSession; focus_canvas: () => void } = $props();

	let ancestors = $derived(get_selection_node_ancestors(session));
	let type_state = $derived(session.commands.next_type?.cycle_node_state ?? null);
	let layout_state = $derived(session.commands.next_layout?.closest_switchable_layout ?? null);
	let type_target_key = $derived(get_state_path_key(type_state));
	let layout_target_key = $derived(get_state_path_key(layout_state));
	let variant_item: VariantItem | null = $derived.by(() => {
		const items = ancestors.map((ancestor) => build_item(ancestor));
		return items.filter((item) => item.option_count > 1).at(-1) ?? items.at(-1) ?? null;
	});

	// The pulsing discovery hint that used to run on empty switchable nodes
	// was removed: a looping animation demands attention permanently instead
	// of hinting once, which reads as an error state and distracts from
	// writing. Discovery is better served by static affordances (chevron,
	// hover state).

	function get_state_path_key(state: SwitchableState) {
		if (!state) return null;
		return serialize_path([...state.node_array_path, state.node_index]);
	}

	function get_layouts(node_type: string): readonly (string | null)[] {
		if (!('layout' in (session.schema[node_type]?.properties ?? {}))) return [null];
		const layouts = get_node_layouts(session, node_type);
		return layouts.length > 0 ? layouts : [null];
	}

	function encode_variant(node_type: string, layout: string | null) {
		return JSON.stringify([node_type, layout]);
	}

	function humanize_node_id(value: unknown, capitalize = false) {
		if (typeof value !== 'string') return '';
		let words = value.replaceAll('_', ' ').replaceAll('-', ' ');
		words = words.replace(/\b(xl|lg|sm)\b/g, (word) => word.toUpperCase());
		return capitalize ? words.charAt(0).toUpperCase() + words.slice(1) : words;
	}

	function get_variant_label(node_type: string, layout: string | null) {
		const type_label = humanize_node_id(node_type, true);
		const layout_label = humanize_node_id(layout);
		return layout_label ? `${type_label} (${layout_label})` : type_label;
	}

	function build_item(ancestor: { node: DocumentNode; path: DocumentPath }): VariantItem {
		const path_key = serialize_path(ancestor.path);
		const is_type_target = path_key === type_target_key;
		const is_layout_target = path_key === layout_target_key;
		const current_layout = typeof ancestor.node.layout === 'string' ? ancestor.node.layout : null;
		const groups: VariantGroup[] = [];

		if (is_type_target && type_state) {
			const allowed_types = new Set([ancestor.node.type, ...type_state.available_types]);
			const schema_order = session.inspect(type_state.node_array_path)?.node_types ?? [];
			for (const node_type of schema_order.filter((node_type) => allowed_types.has(node_type))) {
				const layouts =
					node_type === ancestor.node.type && !is_layout_target
						? [current_layout]
						: get_layouts(node_type);
				groups.push({
					node_type,
					options: layouts.map((layout) => ({
						layout,
						value: encode_variant(node_type, layout)
					}))
				});
			}
		} else if (is_layout_target) {
			groups.push({
				node_type: ancestor.node.type,
				options: get_layouts(ancestor.node.type).map((layout) => ({
					layout,
					value: encode_variant(ancestor.node.type, layout)
				}))
			});
		}

		return {
			...ancestor,
			is_type_target,
			is_layout_target,
			current_value: encode_variant(ancestor.node.type, current_layout),
			label: get_variant_label(ancestor.node.type, current_layout),
			type_label: humanize_node_id(ancestor.node.type, true),
			layout_label: humanize_node_id(current_layout),
			groups,
			option_count: groups.reduce((count, group) => count + group.options.length, 0)
		};
	}

	function handle_variant_change(event: Event, item: VariantItem) {
		choose_variant(item, (event.currentTarget as HTMLSelectElement).value);
		restore_canvas_selection();
	}

	function choose_variant(item: VariantItem, value: string) {
		const [node_type, layout] = JSON.parse(value) as [string, string | null];
		if (node_type !== item.node.type && item.is_type_target) {
			session.commands.next_type?.execute_with_type(node_type, layout);
		} else if (layout !== item.node.layout && item.is_layout_target && layout !== null) {
			session.commands.next_layout?.execute_with_layout(layout);
		}
	}

	function restore_canvas_selection() {
		setTimeout(() => {
			focus_canvas();
			if (session.selection) {
				session.selection = {
					...session.selection,
					path: [...session.selection.path]
				};
			}
		}, 0);
	}

	function handle_variant_keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') restore_canvas_selection();
	}
</script>

{#if variant_item}
	<div class="node-navigator" aria-label="Current node variant">
		<div
			class="variant-label"
			class:switchable={variant_item.option_count > 1}
			title={variant_item.option_count > 1
				? 'Choose variant · Type ⌃⇧↑/↓ · Layout ⌃⇧←/→'
				: undefined}
		>
			<span aria-hidden="true">
				<span class:current-type={variant_item.option_count > 1}>{variant_item.type_label}</span>
				{#if variant_item.layout_label}
					<span class="current-layout">({variant_item.layout_label})</span>
				{/if}
			</span>
			{#if variant_item.option_count > 1}
				<svg class="chevron" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.25" />
				</svg>
				<select
					class="variant-select"
					value={variant_item.current_value}
					aria-label="Choose variant; current variant is {variant_item.label}"
					title="Choose variant · Type ⌃⇧↑/↓ · Layout ⌃⇧←/→"
					onchange={(event) => handle_variant_change(event, variant_item)}
					onblur={restore_canvas_selection}
					onkeydown={handle_variant_keydown}
				>
					{#each variant_item.groups as group (group.node_type)}
						<!-- A group heading over a single option is pure repetition,
						     so only multi-option groups get an optgroup label. -->
						{#if group.options.length > 1}
							<optgroup label={humanize_node_id(group.node_type, true)}>
								{#each group.options as option (option.value)}
									<option value={option.value}>
										{get_variant_label(group.node_type, option.layout)}
									</option>
								{/each}
							</optgroup>
						{:else}
							{#each group.options as option (option.value)}
								<option value={option.value}>
									{get_variant_label(group.node_type, option.layout)}
								</option>
							{/each}
						{/if}
					{/each}
				</select>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Flat inside the unified toolbar pill: no own border, background or
	   shadow — the hover state on the label provides the affordance. */
	.node-navigator {
		position: relative;
		display: flex;
		align-items: center;
		min-height: 36px;
		border-radius: 9999px;
		font-size: 0.75rem;
		line-height: 1.25rem;
		white-space: nowrap;
	}

	.variant-label {
		position: relative;
		display: flex;
		align-items: center;
		padding: 0.45rem 0.75rem;
		border-radius: 9999px;
	}

	/* Long variant labels must not push the other tools out of the toolbar;
	   the cap is shared with the toolbar's other wide elements. */
	.variant-label > span[aria-hidden='true'] {
		display: block;
		max-width: var(--toolbar-item-max-width, 200px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.variant-label.switchable {
		cursor: pointer;
	}

	/* Hover only on hovering devices, so touch taps don't leave the
	   emulated hover state stuck on the label. */
	@media (hover: hover) {
		.variant-label.switchable:hover {
			background: oklch(from var(--app-primary-text) l c h / 0.05);
		}
	}

	.current-type {
		font-weight: 600;
	}

	.current-layout {
		margin-left: 0.3rem;
		font-family: monospace;
		font-size: 0.6875rem;
		opacity: 0.62;
	}

	.chevron {
		width: 0.75rem;
		height: 0.75rem;
		margin-left: 0.45rem;
		opacity: 0.62;
	}

	.variant-select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		appearance: none;
		-webkit-appearance: none;
		border: 0;
		outline: 0;
		background: transparent;
		opacity: 0;
		cursor: pointer;
	}
</style>
