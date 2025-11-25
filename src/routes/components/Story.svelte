<script>
	import { getContext } from 'svelte';
	import { AnnotatedTextProperty, CustomProperty, NodeArrayProperty, Node } from 'svedit';
	const svedit = getContext('svedit');

	let { path } = $props();
	let node = $derived(svedit.session.get(path));
	let has_buttons = $derived(node.buttons.length > 0);
</script>

<Node {path}>
	<div class="story layout-{node.layout} max-w-screen-lg mx-auto w-full">
		<CustomProperty class="image-wrapper" path={[...path, 'image']}>
			<div style="width: 100%; height: 100%;" contenteditable="false">
				<img
					src={node.image || '/icons/image-placeholder.svg'}
					alt={node.title.text}
					class:placeholder={!node.image}
				/>
			</div>
		</CustomProperty>
		<div class="caption">
			<!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
			<AnnotatedTextProperty
				class="heading2"
				path={[...path, 'title']}
				placeholder="The CTA headline should be clear and benefit-driven."
			/>
			<AnnotatedTextProperty
				class="body"
				path={[...path, 'description']}
				placeholder="It should be supported by a short sentence or two to clarify the offer or value, especially if the headline is bold or emotional."
			/>
			<NodeArrayProperty
				class="buttons{!has_buttons ? ' empty' : ''}"
				path={[...path, 'buttons']}
			/>
		</div>
	</div>
</Node>

<style>
	.story {
		container-type: inline-size;
		display: grid;
		grid-template-columns: 1fr;
		/* Apply padding on the sides, but only on devices that need it, e.g. iPhone with notch */
		/* Learn more about this technique here: https://kulturbanause.de/blog/websites-fuer-das-iphone-x-optimieren-weisse-balken-entfernen-viewport-anpassen-safe-area-festlegen/ */
		padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
		padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
		padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
		padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
		@media (min-width: 680px) {
			grid-template-columns: 1fr 2fr;
		}
		gap: var(--s-10);
		padding: var(--s-10) var(--s-6);
	}

	.story :global(.buttons:not(.empty)) {
		padding-top: 24px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--s-2);
	}

	.story :global(.buttons) {
		--layout-orientation: horizontal;
	}

	.story :global(.buttons.empty .node.empty-node-array) {
		position: absolute !important;
	}

	.story img {
		display: block;
		width: 100%;
		height: auto;
	}
	/* Don't crop SVGs */
	.story img[src*='.svg'] {
		object-fit: contain;
		object-position: center;
	}

	/* Placeholder styling */
	.story img.placeholder {
		opacity: 0.7;
		border: 2px dashed var(--stroke-color);
		border-radius: var(--s-2);
		padding: var(--s-4);
		background: var(--canvas-fill-color);
	}

	.story :global(.heading2) {
		margin-bottom: var(--s-2);
	}

	.story :global(.image-wrapper) {
		/* for now ignore clicks on the image, until we have non-text selections */
		/* pointer-events: none; */
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 280px;
		max-width: 320px;
		@media (max-width: 680px) {
			min-width: 100%;
			max-width: 100%;
		}
	}

	/* Layout styles */
	.story.layout-2,
	.story.layout-1 {
		align-items: center;
	}

	@media (min-width: 680px) {
		/* Layout 2: Image on the right - use grid areas */
		.story.layout-2 {
			grid-template-columns: 2fr 1fr;
			grid-template-areas: 'content image';
		}
		.story.layout-2 > :first-child {
			grid-area: image;
		}
		.story.layout-2 > :last-child {
			grid-area: content;
		}
	}

	.story.layout-3 > div:first-child {
		grid-column: 1 / 3;
		grid-row: 1 / 2;
	}

	.story.layout-3 > div:last-child {
		grid-column: 1 / 3;
		grid-row: 2 / 3;
	}
</style>
