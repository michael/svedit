<script>
	import { getContext } from 'svelte';
	import Icon from './Icon.svelte';

	const svedit = getContext('svedit');
	let active_link_path = $derived(get_active_link_path());
	let active_link = $derived(active_link_path ? svedit.session.get(active_link_path) : null);

	function get_active_link_path() {
		const sel = svedit.session.selection;
		if (!sel || sel.type !== 'text') return null;

		const active_annotation = svedit.session.active_annotation('link');
		if (active_annotation) {
			const annotated_text = svedit.session.get(sel.path);
			const annotations = annotated_text?.annotations;
			if (!Array.isArray(annotations)) return null;
			const annotation_index = annotations.indexOf(active_annotation);
			if (annotation_index < 0) return null;
			return [...sel.path, 'annotations', annotation_index, 'node_id'];
		}
		return null;
	}
</script>

{#if active_link_path}
	<div class="link-action-overlay" style="position-anchor: --{active_link_path.join('-')};">
		<a href={active_link?.href} target="_blank" class="small"><Icon name="external-link" /></a>
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
