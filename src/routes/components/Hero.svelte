<script>
	import { getContext } from 'svelte';
	import Node from '../../lib/Node.svelte';
	import AnnotatedStringProperty from '../../lib/AnnotatedStringProperty.svelte';

	const svedit = getContext('svedit');

	let { path } = $props();
	let node = $derived(svedit.doc.get(path));
	let has_image = $derived(node.image && node.image.trim() !== '');
</script>

<Node {path}>
	<div
		class="hero mx-auto w-full"
		class:has-image={has_image}
		style={has_image ? `background-image: url(${node.image});` : ''}
	>
		{#if has_image}
			<div class="hero-overlay"></div>
		{/if}
		<div class="hero-content">
			<AnnotatedStringProperty class="hero-title" path={[...path, 'title']} placeholder="A hero is the prominent, top-most section of a webpage"/>
			<AnnotatedStringProperty class="hero-subtitle" path={[...path, 'description']} placeholder="It should be accompanied by a short description." />
			<div class="github-button-wrapper">
			  <a class="github-button" href="https://github.com/michael/svedit" data-color-scheme="no-preference: light; light: light; dark: dark;" data-size="large" data-show-count="true" aria-label="Star michael/svedit on GitHub">Star</a>
			</div>
		</div>

	</div>
</Node>

<style>
	.hero {
		padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
		padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
		padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
		padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
		padding: var(--s-10) var(--s-6);
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		position: relative;
		background: linear-gradient(135deg, var(--primary-fill-color), color-mix(in srgb, var(--primary-fill-color) 80%, white));
	}

	.github-button-wrapper {
		margin-top: var(--s-6);
	}

	.hero.has-image {
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
	}

	.hero-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 1;
	}

	.hero-content {
		text-align: center;
		max-width: 800px;
		width: 100%;
		position: relative;
		z-index: 2;
	}

	.hero :global(.hero-title) {
		font-size: 3rem;
		font-weight: 700;
		line-height: 1.2;
		margin-bottom: var(--s-6);
		color: white;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.hero :global(.hero-subtitle) {
		font-size: 1.25rem;
		line-height: 1.6;
		opacity: 0.8;
		color: white;
		opacity: 0.9;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		max-width: 600px;
		margin: 0 auto;
	}

	.hero.has-image :global(.hero-title) {
		color: white;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
	}

	.hero.has-image :global(.hero-subtitle) {
		color: white;
		opacity: 0.9;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}

	@media (max-width: 768px) {
		.hero :global(.hero-title) {
			font-size: 2.5rem;
		}

		.hero :global(.hero-subtitle) {
			font-size: 1.125rem;
		}
	}

	@media (max-width: 480px) {
		.hero :global(.hero-title) {
			font-size: 2rem;
		}

		.hero :global(.hero-subtitle) {
			font-size: 1rem;
		}
	}
</style>
