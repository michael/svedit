import '@svedit/demo-shared/framework-switcher.css';

/**
 * Each framework demo is its own static build (see scripts/build_site.mjs),
 * so these are full-page links, not router links.
 */
export default function FrameworkSwitcher() {
	return (
		<nav className="framework-switcher" aria-label="Framework">
			<a href="/">Svelte</a>
			<a href="/react/" aria-current="page">
				React
			</a>
			<a href="/vue/">Vue</a>
			<a href="/solid/">Solid</a>
		</nav>
	);
}
