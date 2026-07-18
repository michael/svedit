<script lang="ts">
	import Icon from './Icon.svelte';
	import { serialize_path } from '../../lib/utils.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import type { Nodes } from '../demo_schema.js';

	const svedit = get_svedit_context();
	let active_link_path = $derived(get_active_link_path());
	let active_link: Nodes['link'] | null = $derived(
		active_link_path ? svedit.session.get(active_link_path) : null
	);

	function get_active_link_path(): DocumentPath | null {
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return null;

		const active_mark = svedit.session.active_mark;
		if (active_mark?.node.type === 'link') {
			return [...sel.path, 'marks', active_mark.index, 'node_id'];
		}
		return null;
	}
</script>

{#if active_link_path}
	<div class="link-action-overlay" style="position-anchor: --{serialize_path(active_link_path)};">
		<a href={active_link?.href} target="_blank" class="small"><Icon name="link" /></a>
	</div>
{/if}

<style>
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
		color: var(--app-primary-text);
		--icon-color: var(--app-primary-text);
		box-shadow: var(--shadow-2);
	}
</style>
