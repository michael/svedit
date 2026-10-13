<script lang="ts">
	import '@svedit/demo-shared/styles/reset.css';
	import '@svedit/demo-shared/styles/typography.css';
	import '../styles/colors.css';
	import '@svedit/demo-shared/styles/spacing.css';
	import '@svedit/demo-shared/styles/shadows.css';
	import '@svedit/demo-shared/styles/annotations.css';
	import FrameworkSwitcher from './FrameworkSwitcher.svelte';

	let { children } = $props();
</script>

<FrameworkSwitcher />

<div class="layout-container">
	{@render children()}
</div>
