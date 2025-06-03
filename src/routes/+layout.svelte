<script>
  import Layout from '$lib/Layout.svelte';

  let { children } = $props();
</script>

<Layout>
  {@render children()}
</Layout>