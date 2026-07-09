<script>
	import { getContext } from 'svelte';
	import { Node, TextProperty } from 'svedit';
	const svedit = getContext('svedit');

	let { path } = $props();
	let node = $derived(svedit.session.get(path));
	let has_image = $derived(node.image && node.image.trim() !== '');
</script>

<Node
	{path}
	class="hero mx-auto w-full {has_image ? 'has-image' : ''}"
	style={has_image ? `background-image: url(${node.image});` : ''}
>
	{#if has_image}
		<div class="hero-overlay"></div>
	{/if}
	<div class="hero-content">
		<TextProperty
			class="hero-title"
			path={[...path, 'title']}
			placeholder="A hero is the prominent, top-most section of a webpage"
		/>
		<TextProperty
			class="hero-subtitle"
			path={[...path, 'description']}
			placeholder="It should be accompanied by a short description."
		/>
		<div class="github-button-wrapper" contenteditable="false">
			<a
				class="github-repo-link"
				href="https://github.com/michael/svedit"
				target="_blank"
				rel="noreferrer"
				aria-label="Open michael/svedit on GitHub"
			>
				<img src="/images/github.svg" alt="" aria-hidden="true" />
				<span>Star</span>
				<span class="github-star-count" aria-label="600+ stars">630+</span>
			</a>
		</div>
	</div>
</Node>

<style>
	:global(.hero) {
		padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
		padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
		padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
		padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
		padding: 100px var(--s-6);
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		position: relative;
		overflow: hidden;
	}

	.github-button-wrapper {
		margin-top: var(--s-6);
		cursor: pointer;
	}

	.github-repo-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		border: 1px solid color-mix(in oklch, var(--app-canvas-fill) 86%, var(--app-primary-text));
		border-radius: 9999px;
		background: var(--app-canvas-fill);
		padding: 0.5em 0.85em;
		color: var(--app-primary-text);
		font-size: 0.95rem;
		font-weight: 650;
		line-height: 1;
		text-decoration: none;
		box-shadow: 0 1px 2px color-mix(in oklch, var(--app-primary-text) 10%, transparent);
	}

	.github-repo-link:hover {
		border-color: color-mix(in oklch, var(--app-canvas-fill) 72%, var(--app-primary-text));
		background: color-mix(in oklch, var(--app-canvas-fill) 96%, var(--app-primary-text));
	}

	.github-repo-link img {
		width: 1.1em;
		height: 1.1em;
	}

	.github-star-count {
		margin-inline-start: 0.1em;
		border-inline-start: 1px solid
			color-mix(in oklch, var(--app-canvas-fill) 82%, var(--app-primary-text));
		padding-inline-start: 0.6em;
		font-variant-numeric: tabular-nums;
		opacity: 0.75;
	}

	:global(.hero.has-image) {
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
		max-width: 512px;
		width: 100%;
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.hero-content::before {
		content: '';
		display: block;
		width: 3.5rem;
		height: 0.22rem;
		margin-bottom: var(--s-5);
		background: var(--app-primary-fill);
		border-radius: 9999px;
	}

	:global(.hero .hero-title) {
		font-size: 3rem;
		font-weight: 700;
		font-variation-settings: 'wght' 700;
		line-height: 1.2;
		margin-bottom: var(--s-6);
		color: var(--app-primary-text);
		letter-spacing: -0.03em;
	}

	:global(.hero .hero-subtitle) {
		font-size: 1.7rem;
		line-height: 1.6;
		color: var(--app-primary-text);
		opacity: 0.95;
		max-width: 600px;
		margin: 0 auto;
	}

	:global(.hero.has-image .hero-title) {
		color: var(--app-primary-text);
	}

	:global(.hero.has-image .hero-subtitle) {
		color: var(--app-primary-text);
		opacity: 0.95;
	}

	:global(.hero a) {
		color: var(--app-primary-fill);
		text-decoration-line: underline;
		text-decoration-color: var(--app-primary-fill);
		text-underline-offset: 0.15em;
	}

	@media (max-width: 768px) {
		:global(.hero .hero-title) {
			font-size: 2.5rem;
		}

		:global(.hero .hero-subtitle) {
			font-size: 1.125rem;
		}
	}

	@media (max-width: 480px) {
		:global(.hero .hero-title) {
			font-size: 2rem;
		}

		:global(.hero .hero-subtitle) {
			font-size: 1rem;
		}
	}
</style>
