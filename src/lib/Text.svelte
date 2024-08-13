<script>
  import { getContext } from 'svelte';

  const surface = getContext('surface');

  let {
    path
  } = $props();
</script>

<div contenteditable="true" data-path={JSON.stringify(path)}>
  {surface.entry_session.get(path)}
</div>
