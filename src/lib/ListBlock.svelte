<script>
  import { getContext } from 'svelte';
  import Container from '$lib/Container.svelte';
  import ListLayout from '$lib/ListLayout.svelte';
  import ListItemBlock from '$lib/ListItemBlock.svelte';
  const svedit = getContext('svedit');

  let {
    path
  } = $props();

  // TODO: we should render this off-canvas
  function is_selected() {
    let selected = false;
    if (svedit.entry_session?.selection?.type === 'container') {
      const block_index = parseInt(path.at(-1));
      const sel_start = Math.min(svedit.entry_session.selection.anchor_offset, svedit.entry_session.selection.focus_offset);
      const sel_end = Math.max(svedit.entry_session.selection.anchor_offset, svedit.entry_session.selection.focus_offset) - 1;
      const is_container_selected = svedit.entry_session.selection.path.join('.') === path.slice(0, -1).join('.');
      return is_container_selected && block_index >= sel_start && block_index <= sel_end;
    }
    return selected;
  }
</script>

<div data-path={path.join('.')} data-type="block" class:selected={is_selected()} data-index={path.at(-1)}>
  <Container path={[...path, 'items']} Layout={ListLayout}>
    <!-- NOTE: We only allow list items here -->
    {#snippet block(block, path)}
      <ListItemBlock {block} {path} />
    {/snippet}
  </Container>
</div>

<style>
  .selected {
    outline: 1px solid #0075d5;
  }
</style>