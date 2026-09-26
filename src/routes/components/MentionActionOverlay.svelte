<script lang="ts">
	import { serialize_path } from '../../lib/utils.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '../svedit_context.js';
	import { mention_directory, mention_user_ids } from '../mention_directory.js';
	import type { Nodes } from '../demo_schema.js';

	const svedit = get_svedit_context();

	let active_mention_path: DocumentPath | null = $derived(get_active_mention_path());
	let active_mention: Nodes['mention'] | null = $derived(
		active_mention_path ? svedit.session.get(active_mention_path) : null
	);

	function get_active_mention_path(): DocumentPath | null {
		const selection = svedit.session.selection;
		if (!selection || selection.type !== 'text') return null;
		const active_mark = svedit.session.active_mark;
		if (active_mark?.node.type !== 'mention') return null;
		return [...selection.path, 'marks', active_mark.index, 'node_id'];
	}

	// Anchors to the inline node's wrapper, whose anchor-name Svedit sets from
	// the same path the component receives.
	let anchor_name = $derived(active_mention_path ? serialize_path(active_mention_path) : null);

	function set_user(user_id: string) {
		if (!active_mention) return;
		const session = svedit.session;
		session.apply(session.tr.set([active_mention.id, 'user_id'], user_id));
	}
</script>

{#if active_mention && anchor_name}
	<div class="mention-popover" style="position-anchor: --{anchor_name};">
		{#each mention_user_ids as user_id (user_id)}
			<button
				class:active={user_id === active_mention.user_id}
				onmousedown={(event) => {
					event.preventDefault();
					set_user(user_id);
				}}
			>
				{mention_directory[user_id].name}
			</button>
		{/each}
	</div>
{/if}

<style>
	.mention-popover {
		position: fixed;
		bottom: anchor(top);
		justify-self: anchor-center;
		margin-bottom: var(--s-2);
		position-try-fallbacks: flip-block;
		position-visibility: anchors-visible;
		z-index: 60;
		display: flex;
		gap: 2px;
		padding: 4px;
		background: var(--app-canvas-fill);
		border: 1px solid oklch(from var(--app-primary-text) l c h / 0.12);
		border-radius: 9999px;
		box-shadow:
			0 1px 2px oklch(0% 0 0 / 0.12),
			0 4px 16px oklch(0% 0 0 / 0.08);
		pointer-events: auto;
	}

	.mention-popover button {
		padding: var(--s-1) var(--s-2);
		border: none;
		border-radius: 9999px;
		background: transparent;
		color: var(--app-primary-text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.mention-popover button.active {
		background: oklch(from var(--app-primary-text) l c h / 0.09);
	}
</style>
