<script>
	import { getContext } from 'svelte';
	import { Node, AnnotatedTextProperty, CustomProperty } from 'svedit';
	const svedit = getContext('svedit');
	let { path } = $props();
	let node = $derived(svedit.editor_state.get(path));
</script>

<Node {path}>
	<div class="image-grid-item flex-column gap-y-3">
		<CustomProperty class="image-wrapper" path={[...path, 'image']}>
			<div contenteditable="false" style="aspect-ratio: 1/1; width: 100%;">
				<img
					src={node.image || '/icons/image-placeholder.svg'}
					alt={node.title.text}
					class:placeholder={!node.image}
				/>
			</div>
		</CustomProperty>
		<div class="caption flex-column gap-y-3">
			<!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
			<AnnotatedTextProperty
				class="heading3"
				path={[...path, 'title']}
				placeholder="Gallery item title"
			/>
			<AnnotatedTextProperty class="body" path={[...path, 'description']} placeholder="Details" />
		</div>
	</div>
</Node>

<style>
	.image-grid-item {
		padding: var(--s-2);
		/*background: #efefef;*/
		height: 100%;
	}
	.image-grid-item img {
		width: 100%;
		object-fit: cover;
		height: 100%;
	}

	/* Don't crop SVGs */
	.image-grid-item img[src*='.svg'] {
		object-fit: contain;
		object-position: center;
	}

	/* Placeholder styling */
	.image-grid-item img.placeholder {
		opacity: 0.7;
		border-radius: var(--s-2);
		padding: var(--s-4);
		background: var(--canvas-fill-color);
	}

	.image-grid-item :global(.image-wrapper) {
		/* for now ignore clicks on the image, until we have non-text selections */
		/* pointer-events: none; */
		display: flex;
		align-items: center;
		justify-content: center;
		@media (max-width: 680px) {
			min-width: 100%;
			max-width: 100%;
		}
	}
</style>
