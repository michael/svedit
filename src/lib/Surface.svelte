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
    const inserted_char = event.data;
    event.preventDefault();
    entry_session.insert_text(inserted_char);
  }

  // Map selection to model
  function onselectionchange(event) {
    const dom_selection = window.getSelection();
    // console.log('dom_selection', dom_selection);

    let selection = __get_text_selection_from_dom() || __get_container_selection_from_dom();

    if (selection) {
      entry_session.selection = selection;
    }
  }

  function render_selection() {
    const selection = entry_session.selection;
    let prev_selection = __get_text_selection_from_dom() || __get_container_selection_from_dom();

    console.log('render_selection', JSON.stringify(selection), JSON.stringify(prev_selection));

    if (!selection) {
      console.log('No model selection -> just leave things as is');
      // let dom_selection = window.getSelection();
      // dom_selection.removeAllRanges();
      return;
    }

    if (JSON.stringify(selection) === JSON.stringify(prev_selection)) {
      console.log('SELECTION RERENDER SKIPPED.');
      return; // No need to re-render
    }

    console.log('RENRENDER SELECTION');
    
    if (selection?.type === 'text') {
      __render_text_selection();
    } else if (selection?.type === 'container') {
      __render_container_selection();
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
      entry_session.insert_text('\n');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      entry_session.annotate_text('strong');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
      entry_session.annotate_text('emphasis');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      entry_session.annotate_text('link', {
        href: window.prompt('Enter the URL', 'https://example.com')
      });
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function __get_container_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    let focus_root = dom_selection.focusNode.parentElement?.closest('[data-path][data-type="block"]');
    if (!focus_root) return null;

    let anchor_root = dom_selection.anchorNode.parentElement?.closest('[data-path][data-type="block"]');
    if (!anchor_root) return null;

    if (!(focus_root && anchor_root)) {
      return null;
    }

    let focus_root_path = focus_root.dataset.path.split('.');
    let anchor_root_path = anchor_root.dataset.path.split('.');

    const is_same_container = focus_root_path.slice(0, -1).join('.') === anchor_root_path.slice(0, -1).join('.');
    if (!is_same_container) {
      console.log('invalid selection, not same container');
      return null;
    }
    console.log('focus_root / anchor_root', focus_root, anchor_root);

    // return focus_root;
    const result = {
      type: 'container',
      path: anchor_root_path.slice(0, -1),
      anchor_offset: anchor_root_path.at(-1),
      focus_offset: focus_root_path.at(-1),
    };

    console.log('container selection', result);
    return result;
  }

  function __get_text_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    let focus_root = dom_selection.focusNode.parentElement?.closest('[data-path][data-type="text"]');
    if (!focus_root) return null;
    let anchor_root = dom_selection.anchorNode.parentElement?.closest('[data-path][data-type="text"]');
    if (!anchor_root) return null;
    
    if (focus_root !== anchor_root) {
      return null;
    }

    const range = dom_selection.getRangeAt(0);
    const path = focus_root.dataset.path.split('.');

    if (!path) return null;

    let anchorOffset = 0;
    let focusOffset = 0;
    let currentOffset = 0;

    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeLength = node.length;
        
        if (node === range.startContainer) {
          anchorOffset = currentOffset + range.startOffset;
        }
        if (node === range.endContainer) {
          focusOffset = currentOffset + range.endOffset;
        }
        
        currentOffset += nodeLength;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const childNode of node.childNodes) {
          processNode(childNode);
        }
      }
      
      return (focusOffset !== 0);
    }

    // Process nodes to find offsets
    for (const childNode of focus_root.childNodes) {
      if (processNode(childNode)) break;
    }

    // Check if it's a backward selection
    const isBackward = dom_selection.anchorNode === range.endContainer && 
                      dom_selection.anchorOffset === range.endOffset;

    // Swap offsets if it's a backward selection
    if (isBackward) {
      [anchorOffset, focusOffset] = [focusOffset, anchorOffset];
    }

    return {
      type: 'text',
      path,
      anchor_offset: anchorOffset,
      focus_offset: focusOffset
    };
  }

  function __render_container_selection() {
    console.log('render_container_selection', entry_session.selection);
    const selection = entry_session.selection;
    const containerEl = ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="container"]`);
    if (!containerEl) return;

    const blocksEl = containerEl.querySelector('.blocks');
    if (!blocksEl) return;

    const blockElements = blocksEl.children;
    if (blockElements.length === 0) return;

    const anchorNode = blockElements[selection.anchor_offset];
    const focusNode = blockElements[selection.focus_offset];

    if (!anchorNode || !focusNode) return;

    const range = document.createRange();
    range.setStartBefore(anchorNode);
    range.setEndAfter(focusNode);

    const domSelection = window.getSelection();
    domSelection.removeAllRanges();
    domSelection.addRange(range);

    // Ensure the container is focused
    containerEl.focus();
    // const selection = entry_session.selection;
    // const el = ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="container"]`);
    // el.focus();
  }

  function __render_text_selection() {
    const selection = entry_session.selection;
    // The element that holds the annotated text
    const el = ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="text"]`);

    const range = document.createRange();
    const dom_selection = window.getSelection();
    let currentOffset = 0;
    let anchorNode, anchorNodeOffset, focusNode, focusNodeOffset;
    const is_backward = selection.anchor_offset > selection.focus_offset;
    const start_offset = Math.min(selection.anchor_offset, selection.focus_offset);
    const end_offset = Math.max(selection.anchor_offset, selection.focus_offset);

    // Helper function to process each node
    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeLength = node.length;
        
        // Check if this node contains the start offset
        if (!anchorNode && currentOffset + nodeLength >= start_offset) {
          if (is_backward) {
            focusNode = node;
            focusNodeOffset = start_offset - currentOffset;
          } else {
            anchorNode = node;
            anchorNodeOffset = start_offset - currentOffset;
          }
        }
        
        // Check if this node contains the end offset
        if (!focusNode && currentOffset + nodeLength >= end_offset) {
          if (is_backward) {
            anchorNode = node;
            anchorNodeOffset = end_offset - currentOffset;
          } else {
            focusNode = node;
            focusNodeOffset = end_offset - currentOffset;
          }
          return true; // Stop iteration
        }
        
        currentOffset += nodeLength;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const childNode of node.childNodes) {
          if (processNode(childNode)) return true; // Stop iteration if end found
        }
      }
      return false; // Continue iteration
    }

    // Iterate through child nodes
    for (const childNode of el.childNodes) {
      if (processNode(childNode)) break;
    }

    // Handle edge case: cursor at the end of an annotation
    if (anchorNode && !focusNode && currentOffset === end_offset) {
      focusNode = anchorNode.nextSibling || anchorNode;
      focusNodeOffset = focusNode === anchorNode ? anchorNode.length : 0;
    }

    // Set the range if both start and end were found
    if (anchorNode && focusNode) {
      range.setStart(anchorNode, anchorNodeOffset);
      range.setEnd(focusNode, focusNodeOffset);
      dom_selection.removeAllRanges();
      dom_selection.addRange(range);
      if (is_backward) {
        dom_selection.extend(focusNode, focusNodeOffset);
      }
      el.focus(); // needed?
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
  class:hide-selection={entry_session.selection?.type === 'container'}
  bind:this={ref}
  {onbeforeinput}
  contenteditable={editable ? 'true' : 'false'}
>
  {@render children()}
</div>

<style>
  div:focus {
    outline: none;
  }

  div.hide-selection :global(::selection) {
    background: transparent;
  }
</style>