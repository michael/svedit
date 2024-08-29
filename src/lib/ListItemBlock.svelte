<script>
  import Text from '$lib/Text.svelte';
  import { getContext } from 'svelte';
  const surface = getContext('surface');

  let {
    path
  } = $props();

  function is_selected() {
    let selected = false;
    if (surface.entry_session?.selection?.type === 'container') {
      const block_index = parseInt(path.at(-1));
      const sel_start = Math.min(surface.entry_session.selection.anchor_offset, surface.entry_session.selection.focus_offset);
      const sel_end = Math.max(surface.entry_session.selection.anchor_offset, surface.entry_session.selection.focus_offset) - 1;
      const is_container_selected = surface.entry_session.selection.path.join('.') === path.slice(0, -1).join('.');
      return is_container_selected && block_index >= sel_start && block_index <= sel_end;
    }
    return selected;
  }

  function is_container_cursor_before() {
    // if (surface.entry_session?.selection?.type === 'container') {
    //   const block_index = path.at(-1)
    //   const sel_start = Math.min(surface.entry_session.selection.anchor_offset, surface.entry_session.selection.focus_offset);
    //   return block_index < sel_start;
    // }
    // return false;
  }
</script>


<!--  IMPORTANT: There must not be any white space between the diff and <Text>-->
<div data-path={path.join('.')} data-type="block" class:selected={is_selected()} data-index={path.at(-1)}><Text path={[...path,'description']} /></div>

<style>
  div {
    position: relative;
    padding-left: 1.5em; /* Adjust as needed */
  }
  
  div::before {
    content: '\25E6'; /* Unicode for a hollow circle */
    position: absolute;
    left: 0.5em; /* Adjust as needed */
    top: 0;
    font-size: 1em; /* Adjust as needed */
  }
  .selected {
    outline: 1px solid #0075d5;
  }

</style>