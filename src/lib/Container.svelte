<script>
  import { getContext } from 'svelte';
  const surface = getContext('surface');

  let {
    path,
    block,
    Layout,
  } = $props();
</script>

<div data-type="container" data-path={path.join('.')}>
  <Layout>
    {#each surface.entry_session.get(path) as _block, index}
      {@render block(_block, [...path, index], index)}
    {/each}
  </Layout>
</div>