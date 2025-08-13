<script>
	import { getContext } from 'svelte';
	import { Node, AnnotatedStringProperty, CustomProperty } from 'svedit';
	const svedit = getContext('svedit');
	let { path } = $props();
	let node = $derived(svedit.doc.get(path));
</script>

<Node {path}>
	<div class="image-grid-item">
		<CustomProperty class="image-wrapper" path={[...path, 'image']}>
			<img
				src={node.image || '/icons/image-placeholder.svg'}
				alt={node.title[0]}
				class:placeholder={!node.image}
			/>
		</CustomProperty>
		<div class="caption">
			<!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
			<AnnotatedStringProperty class="heading3" path={[...path, 'title']} placeholder="Gallery item title" />
			<!-- <AnnotatedStringProperty class="body" path={[...path, 'description']} /> -->
		</div>
	</div>
</Node>

<style>
  .image-grid-item img {
		width: 100%;
		/* height: auto; */
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
