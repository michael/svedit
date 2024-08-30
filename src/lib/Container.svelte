<script>
  import { getContext } from 'svelte';
  const svedit = getContext('svedit');

  let {
    path,
    block,
    Layout,
  } = $props();
</script>

<div data-type="container" data-path={path.join('.')}>
  <Layout>
    {#each svedit.entry_session.get(path) as _block, index}
      {@render block(_block, [...path, index], index)}
    {/each}
  </Layout>
</div>