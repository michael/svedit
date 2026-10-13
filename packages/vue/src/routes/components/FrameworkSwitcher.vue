<script setup lang="ts">
import '@svedit/demo-shared/framework-switcher.css';
</script>

<!--
	Each framework demo is its own static build (see scripts/build_site.mjs),
	so these are full-page links, not router links.
-->
<template>
	<nav class="framework-switcher" aria-label="Framework">
		<a href="/">Svelte</a>
		<a href="/react/">React</a>
		<a href="/vue/" aria-current="page">Vue</a>
	</nav>
</template>
