import { For, Show, createMemo } from 'solid-js';
import Icon from './Icon.js';
import { serialize_path } from '@svedit/solid';
import type { DocumentNode, DocumentPath } from '@svedit/solid';
import {
	get_node_layouts,
	get_selection_node_ancestors
} from '@svedit/demo-shared/src/app_utils.js';
import type { AppSession } from '../demo_session.js';
import './NodeNavigator.css';

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

// The pulsing discovery hint that used to run on empty switchable nodes
// was removed: a looping animation demands attention permanently instead
// of hinting once, which reads as an error state and distracts from
// writing. Discovery is better served by static affordances (chevron,
// hover state).

function get_state_path_key(state: SwitchableState) {
	if (!state) return null;
	return serialize_path([...state.node_array_path, state.node_index]);
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

export default function NodeNavigator(props: { session: AppSession; focus_canvas: () => void }) {
	const ancestors = createMemo(() => get_selection_node_ancestors(props.session));
	const type_state = createMemo(() => props.session.commands.next_type?.cycle_node_state ?? null);
	const layout_state = createMemo(
		() => props.session.commands.next_layout?.closest_switchable_layout ?? null
	);
	const type_target_key = createMemo(() => get_state_path_key(type_state()));
	const layout_target_key = createMemo(() => get_state_path_key(layout_state()));
	// Recomputed per session change; compared by its current value and
	// options so unrelated changes keep the rendered select and options.
	const variant_item = createMemo<VariantItem | null>(
		() => {
			const items = ancestors().map((ancestor) => build_item(ancestor));
			return items.filter((item) => item.option_count > 1).at(-1) ?? items.at(-1) ?? null;
		},
		null,
		{
			equals: (a, b) =>
				a === b ||
				(!!a &&
					!!b &&
					a.current_value === b.current_value &&
					a.label === b.label &&
					a.node === b.node &&
					a.is_type_target === b.is_type_target &&
					a.is_layout_target === b.is_layout_target &&
					a.option_count === b.option_count &&
					JSON.stringify(a.groups) === JSON.stringify(b.groups))
		}
	);

	function get_layouts(node_type: string): readonly (string | null)[] {
		if (!('layout' in (props.session.schema[node_type]?.properties ?? {}))) return [null];
		const layouts = get_node_layouts(props.session, node_type);
		return layouts.length > 0 ? layouts : [null];
	}

	function build_item(ancestor: { node: DocumentNode; path: DocumentPath }): VariantItem {
		const path_key = serialize_path(ancestor.path);
		const is_type_target = path_key === type_target_key();
		const is_layout_target = path_key === layout_target_key();
		const current_layout = typeof ancestor.node.layout === 'string' ? ancestor.node.layout : null;
		const groups: VariantGroup[] = [];
		const current_type_state = type_state();

		if (is_type_target && current_type_state) {
			const allowed_types = new Set([ancestor.node.type, ...current_type_state.available_types]);
			const schema_order =
				props.session.inspect(current_type_state.node_array_path)?.node_types ?? [];
			for (const node_type of schema_order.filter((node_type: string) =>
				allowed_types.has(node_type)
			)) {
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
			props.session.commands.next_type?.execute_with_type(node_type, layout);
		} else if (layout !== item.node.layout && item.is_layout_target && layout !== null) {
			props.session.commands.next_layout?.execute_with_layout(layout);
		}
	}

	function restore_canvas_selection() {
		setTimeout(() => {
			props.focus_canvas();
			if (props.session.selection) {
				props.session.selection = {
					...props.session.selection,
					path: [...props.session.selection.path]
				};
			}
		}, 0);
	}

	function handle_variant_keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') restore_canvas_selection();
	}

	const switchable = () => (variant_item()?.option_count ?? 0) > 1;

	return (
		<Show when={variant_item()}>
			{(item) => (
				<div class="node-navigator" aria-label="Current node variant">
					<div
						class="variant-label"
						classList={{ switchable: switchable() }}
						title={switchable() ? 'Choose variant · Type ⌃⇧↑/↓ · Layout ⌃⇧←/→' : undefined}
					>
						<span aria-hidden="true">
							<span classList={{ 'current-type': switchable() }}>{item().type_label}</span>
							<Show when={item().layout_label}>
								<span class="current-layout">({item().layout_label})</span>
							</Show>
						</span>
						<Show when={switchable()}>
							<Icon name="chevron-down" />
							<select
								class="variant-select"
								value={item().current_value}
								aria-label={`Choose variant; current variant is ${item().label}`}
								title="Choose variant · Type ⌃⇧↑/↓ · Layout ⌃⇧←/→"
								onChange={(event) => handle_variant_change(event, item())}
								onBlur={restore_canvas_selection}
								onKeyDown={handle_variant_keydown}
							>
								<For each={item().groups}>
									{(group) =>
										// A group heading over a single option is pure repetition,
										// so only multi-option groups get an optgroup label.
										group.options.length > 1 ? (
											<optgroup label={humanize_node_id(group.node_type, true)}>
												<For each={group.options}>
													{(option) => (
														<option
															value={option.value}
															selected={option.value === item().current_value}
														>
															{get_variant_label(group.node_type, option.layout)}
														</option>
													)}
												</For>
											</optgroup>
										) : (
											<For each={group.options}>
												{(option) => (
													<option
														value={option.value}
														selected={option.value === item().current_value}
													>
														{get_variant_label(group.node_type, option.layout)}
													</option>
												)}
											</For>
										)
									}
								</For>
							</select>
						</Show>
					</div>
				</div>
			)}
		</Show>
	);
}
