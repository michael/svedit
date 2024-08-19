<script>
  import { setContext } from 'svelte';
  import { tick } from 'svelte';
  import { untrack } from "svelte";

  let {
    entry_session,
    children,
    editable = false,
    ref = $bindable(),
  } = $props();

  setContext("surface", {
    get entry_session() {
      return entry_session;
    }
  });

  function onbeforeinput(event) {
    // const selection = window.getSelection();
    // const path = selection.focusNode.parentElement.dataset.path.split('.');
    const inserted_char = event.data;
    event.preventDefault();
    
    // TODO: We could now use the model selection to figure out where to insert the text at current cursor position
    entry_session.insert_text(inserted_char);
  }

  // Map selection to model
  function onselectionchange(event) {
    const selection = window.getSelection();
    let new_selection;
    let path;
    if (selection.focusNode === selection.anchorNode) {
      path = selection.focusNode?.parentElement?.dataset?.path?.split('.');
    }
    
    // Now we know this is a text selection
    if (path) {
      // This is only to keep the model in sync with the latest DOM selection
      // In this case we don't want to re-render the selection and prevent and infinite loop
      new_selection = {
        type: 'text',
        path,
        anchor_index: selection.anchorOffset,
        focus_index: selection.focusOffset,
      };
      // console.log('model selection updated', $state.snapshot(entry_session.selection));
    } else {
      // console.log('Unknown DOM selection. Clear selection.');
      new_selection = null;
    }
    entry_session.selection = new_selection;
  }


  function render_selection() {
    const selection = entry_session.selection;
    const dom_selection = window.getSelection();
    const path = dom_selection.focusNode?.parentElement?.dataset?.path?.split('.');
    const new_selection = {
      type: 'text',
      path,
      anchor_index: dom_selection.anchorOffset,
      focus_index: dom_selection.focusOffset,
    };

    if (!selection) {
      console.log('No selection to render');
      return;
    }

    if (JSON.stringify(selection) === JSON.stringify(new_selection)) {
      console.log('SELECTION RERENDER SKIPPED.');
      return; // No need to re-render
    }

    console.log('RENRENDER SELECTION');
    
    if (selection?.type === 'text') {
      // console.log('rendering text selection', $state.snapshot(selection.path));
      const contenteditable_el = ref.querySelector(`[data-path="${selection.path.join('.')}"]`);
      const first_text_node = contenteditable_el.childNodes[0];
      const range = document.createRange();
      range.setStart(first_text_node, selection.anchor_index);
      range.setEnd(first_text_node, selection.focus_index);
      dom_selection.removeAllRanges();
      dom_selection.addRange(range);
    } else {
      console.log('unsupported selection type', selection.type);
    }
  }

  function onkeydown(e) {

    console.log('onkeydown', e.key);
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      entry_session.undo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      entry_session.redo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      console.log('Enter key pressed with ctrl or meta');
      entry_session.insert_text('\n');
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Whenever the model selection changes, render the selection
  $effect(() => {
    render_selection();
  });

</script>

<svelte:document {onselectionchange} />

<svelte:window {onkeydown} />

<div
bind:this={ref}
  {onbeforeinput}
  contenteditable={editable ? 'true' : 'false'}
>
  {@render children()}
</div>