<script lang="ts">
	import '@svedit/demo-shared/framework-switcher.css';
</script>

<!--
	Each framework demo is its own static build (see scripts/build_site.mjs),
	so these are full-page links. rel="external" keeps SvelteKit's client
	router and its prerender crawler away from them.
-->
<nav class="framework-switcher" aria-label="Framework">
	<a href="/" aria-current="page" rel="external">Svelte</a>
	<a href="/react/" rel="external">React</a>
	<a href="/vue/" rel="external">Vue</a>
	<a href="/solid/" rel="external">Solid</a>
</nav>
