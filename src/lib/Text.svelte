<script>
  import { getContext } from 'svelte';

  const surface = getContext('surface');

  let {
    path
  } = $props();
</script>

<div contenteditable="true" data-path={path.join('.')}>
  {surface.entry_session.get(path)}
</div>
