<script>
  import { setContext } from 'svelte';
  import { tick } from 'svelte';

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

  async function onbeforeinput(event) {
    const selection = window.getSelection();
    const path = selection.focusNode.parentElement.dataset.path.split('.');
    const inserted_char = event.data;
    
    entry_session.insert_text(path, [selection.anchorOffset, selection.focusOffset], inserted_char);
    const newOffset = selection.anchorOffset + 1;
    event.preventDefault();

    // Set the DOM selection after inserting the text
    await tick();

    // Setting the selection automatically triggers a re-render of the corresponding DOMSelection.
    entry_session.selection = {
      type: 'text',
      path,
      anchor_index: newOffset,
      focus_index: newOffset,
    };
  }

  // Map selection to model
  function onselectionchange(event) {
    console.log('selectionchange', event);
    // TODO: Map selection to model
    
    // const selection = window.getSelection();
    // console.log(selection);
    // if (selection.rangeCount > 0 && selection.anchorNode === editor.firstChild) {
    //   cursorPosition = selection.getRangeAt(0).startOffset;
    // }
    // console.log('cursorPosition', cursorPosition);
  }

  function render_selection() {
    const dom_selection = window.getSelection();
    const selection = entry_session.selection;
    if (!selection) {
      if (dom_selection) {
        dom_selection.removeAllRanges();
      }
    } else if (selection?.type === 'text') {
      console.log('rendering DOM selection', entry_session.selection.path);

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

  // Whenever the model selection changes, render the selection
  $effect(() => {
    render_selection();
  });

</script>

<svelte:document {onselectionchange} />

<div
bind:this={ref}
  {onbeforeinput}
  contenteditable={editable ? 'true' : 'false'}
  onselectionchange={onselectionchange}
>
  {@render children()}
</div>