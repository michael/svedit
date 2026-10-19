import '@svedit/demo-shared/framework-switcher.css';

/**
 * Each framework demo is its own static build (see scripts/build_site.mjs),
 * so these are full-page links, not router links.
 */
export default function FrameworkSwitcher() {
	return (
		<nav class="framework-switcher" aria-label="Framework">
			<a href="/">Svelte</a>
			<a href="/react/">React</a>
			<a href="/vue/">Vue</a>
			<a href="/solid/" aria-current="page">
				Solid
			</a>
		</nav>
	);
}
