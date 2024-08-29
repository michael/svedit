<script>
  import Text from '$lib/Text.svelte';
  import { getContext } from 'svelte';
  const surface = getContext('surface');

  let {
    path
  } = $props();

  // TODO: we should render this off-canvas
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
</script>


<!-- ATTENTION: Do not format the following line, as whitespace will mess up contenteditable -->
<div data-path={path.join('.')} data-type="block" class:selected={is_selected()} data-index={path.at(-1)}>
  <div class="title"><Text path={[...path,'title']} /></div>
  <div class="description"><Text path={[...path,'description']} /></div>
</div>

<style>
  .title {
    font-size: 1.5em;
    font-weight: bold;
  }

  .description {
    font-size: 1em;
    font-weight: normal;
  }
  .selected {
    outline: 1px solid #0075d5;
  }
</style>