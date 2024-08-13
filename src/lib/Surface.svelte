<script>
  import { setContext } from 'svelte';

  let {
    entry_session,
    children,
    editable = false
  } = $props();

  setContext("surface", {
    get entry_session() {
      return entry_session;
    }
  });

  // setContext("app", get entry_session());
  // insert_text: function(path, value) {
  //   // TODO: Implement
  // },
  // resolve_path(path) {
  //   return entry[path];
  // }

  function oninput(event) {
    // event.stopPropagation();
    // event.preventDefault();

    console.log('event.data', event.data);
    console.log('innerText', event.target.innerText)
    // if (!event.data) return

    // return;
    // console.log('input', event);
    // const path = JSON.parse(event.target.getAttribute('data-path'));

    const selection = window.getSelection();
    const path = JSON.parse(selection.focusNode.parentElement.dataset.path);

    // console.log('focusnode', selection.focusNode.parentElement);
    console.log(path);

    // entry_session.set(path, event.target.innerText);
    
    entry_session.set(path, event.target.innerText);
  }

  function onbeforeinput(event) {
    console.log('onbeforeinput', event);
    const selection = window.getSelection();
    // console.log('selection', );
    const path = JSON.parse(selection.focusNode.parentElement.dataset.path);
    console.log(path, event.data);

    const inserted_char = event.data;

    entry_session.insert_text(path, [selection.anchorOffset, selection.focusOffset], inserted_char);

    event.preventDefault();
  }

  function onselectionchange(event) {
    console.log('selectionchange', event);
    
    // const selection = window.getSelection();
    // console.log(selection);
    // if (selection.rangeCount > 0 && selection.anchorNode === editor.firstChild) {
    //   cursorPosition = selection.getRangeAt(0).startOffset;
    // }
    // console.log('cursorPosition', cursorPosition);

  }

</script>


<svelte:document {onselectionchange} />

<!-- {oninput} -->
<div
  {onbeforeinput}
  contenteditable={editable ? 'true' : 'false'}
  onselectionchange={onselectionchange}
>
  {@render children()}
</div>