<script>
  import { setContext } from 'svelte';

  let {
    entry_session,
    children,
    editable = false,
    ref = $bindable(),
  } = $props();

  let is_mouse_down = $state(false);

  setContext("svedit", {
    get entry_session() {
      return entry_session;
    }
  });

  function onmousedown() {
    is_mouse_down = true;
  }

  function onmouseup() {
    is_mouse_down = false;
  }

  function onbeforeinput(event) {
    const inserted_char = event.data;
    
    event.preventDefault();
    if (inserted_char) {
      entry_session.insert_text(inserted_char);
    }
  }

  // Map selection to model
  function onselectionchange(event) {
    let selection = __get_text_selection_from_dom() || __get_container_selection_from_dom();

    console.log('latest selection from dom', JSON.stringify(selection));

    if (selection) {
      entry_session.selection = selection;
    }
  }

  function render_selection() {
    const selection = entry_session.selection;
    let prev_selection = __get_text_selection_from_dom() || __get_container_selection_from_dom();

    if (!selection) {
      console.log('No model selection -> just leave things as is');
      let dom_selection = window.getSelection();
      dom_selection.removeAllRanges();
      return;
    }

    if (JSON.stringify(selection) === JSON.stringify(prev_selection)) {
      // console.log('SELECTION RERENDER SKIPPED.');
      return; // No need to re-render
    }

    // console.log('RENRENDER SELECTION');
    
    if (selection?.type === 'text') {
      __render_text_selection();
    } else if (selection?.type === 'container') {
      __render_container_selection();
    } else {
      console.log('unsupported selection type', selection.type);
    }
  }

  function onkeydown(e) {
    const selection = entry_session.selection;
    // console.log('onkeydown', e.key);
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
    } else if (e.key === 'Backspace') {
      entry_session.delete();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'container') {
      entry_session.insert_block();
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowDown') && !e.shiftKey && selection?.type === 'container') {
      entry_session.move_container_cursor('forward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowUp') && !e.shiftKey && selection?.type === 'container') {
      entry_session.move_container_cursor('backward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowDown') && e.shiftKey && selection?.type === 'container') {
      entry_session.expand_container_selection('forward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowUp') && e.shiftKey && selection?.type === 'container') {
      entry_session.expand_container_selection('backward');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Escape' && selection) {
      entry_session.select_parent();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function __get_container_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    let focus_node = dom_selection.focusNode;
    let anchor_node = dom_selection.anchorNode;

    if (!focus_node.closest) focus_node = focus_node.parentElement;
    if (!anchor_node.closest) anchor_node = anchor_node.parentElement;

    let focus_root = focus_node.closest('[data-path][data-type="block"]');
    if (!focus_root) return null;

    let anchor_root = anchor_node.closest('[data-path][data-type="block"]');
    if (!anchor_root) return null;

    if (!(focus_root && anchor_root)) {
      return null;
    }

    let focus_root_path = focus_root.dataset.path.split('.');
    let anchor_root_path = anchor_root.dataset.path.split('.');

    // HACK: this works only for one level nesting - should be done recursively to work generally
    if (focus_root_path.length > anchor_root_path.length) {
      focus_root = focus_root.parentElement.closest('[data-path][data-type="block"]');
      focus_root_path = focus_root.dataset.path.split('.');      
    } else if (anchor_root_path.length > focus_root_path.length) {
      anchor_root = anchor_root.parentElement.closest('[data-path][data-type="block"]');
      anchor_root_path = anchor_root.dataset.path.split('.');
    }

    const is_same_container = focus_root_path.slice(0, -1).join('.') === anchor_root_path.slice(0, -1).join('.');
    if (!is_same_container) {
      console.log('invalid selection, not same container');
      return null;
    }

    let anchor_offset = parseInt(anchor_root_path.at(-1));
    let focus_offset = parseInt(focus_root_path.at(-1));

    // Check if it's a reverse selection
    const is_reverse = anchor_offset > focus_offset;

    if (is_reverse) {
      anchor_offset += 1;
    } else {
      focus_offset += 1;
    }

    const result = {
      type: 'container',
      path: anchor_root_path.slice(0, -1),
      anchor_offset: anchor_offset,
      focus_offset: focus_offset,
    };
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

  function __get_block_element(container_path, block_offset) {
    const containerEl = ref.querySelector(`[data-path="${container_path}"][data-type="container"]`);
    if (!containerEl) return null;

    // const blocksEl = containerEl.querySelector('.blocks');
    // if (!blocksEl) return null;

    const blockElements = containerEl.children;
    if (blockElements.length === 0) return null;

    return blockElements[block_offset];
  }

  function __render_container_selection() {
    // console.log('render_container_selection', $state.snapshot(entry_session.selection));
    const selection = entry_session.selection;
    const container = entry_session.get(selection.path);
    const container_path = selection.path.join('.');

    // we need to translate the cusor offset to block offsets now
    let anchor_block_offset = selection.anchor_offset > selection.focus_offset ? selection.anchor_offset - 1 : selection.anchor_offset;
    let focus_block_offset = selection.focus_offset > selection.anchor_offset ? selection.focus_offset - 1 : selection.focus_offset;
    const anchor_node = __get_block_element(container_path, anchor_block_offset);
    const focus_node = __get_block_element(container_path, focus_block_offset);

    if (!anchor_node || !focus_node) return;
    const dom_selection = window.getSelection();
    const range = document.createRange();

    if (selection.anchor_offset === selection.focus_offset) {
      // Collapsed selection (cursor between blocks)
      if (selection.anchor_offset === container.length) {
        range.setStartAfter(anchor_node);
        range.setEndAfter(anchor_node);
      } else {
        range.setStartBefore(anchor_node);
        range.setEndBefore(anchor_node);
      }
      dom_selection.removeAllRanges();
      dom_selection.addRange(range);

    } else {
      // Non-collapsed selection
      if (selection.anchor_offset > selection.focus_offset) {   

        // find the first text node inside focus node
        const last_text_node = __find_last_text_node(anchor_node);
        const first_text_node = __find_first_text_node(focus_node);
        if (!last_text_node || !first_text_node) {
          console.error('Selection mapping error: Make sure every block contains at least one text node');
          return;
        }
        range.setStart(first_text_node, 0);
        range.setEnd(last_text_node, last_text_node.length);
        dom_selection.removeAllRanges();
        dom_selection.addRange(range);
        // Phew, this was a hard not to crack. But with that code the direction can be reversed.
        dom_selection.setBaseAndExtent(last_text_node, last_text_node.length, first_text_node, 0);
      } else {
        range.setStart(anchor_node, 0);
        range.setEnd(focus_node, focus_node.childNodes.length);
        dom_selection.removeAllRanges();
        dom_selection.addRange(range);
      }
    }

    // Ensure the container is focused
    const container_el = ref.querySelector(`[data-path="${container_path}"][data-type="container"]`);
    if (container_el) {
      container_el.focus();
      // Scroll the selection into view
      setTimeout(() => {
        (selection.anchor_offset > selection.focus_offset ? focus_node : anchor_node).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }, 0);
    } else {
      console.log('no container element found!!');
    }
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

      // Scroll the selection into view
      setTimeout(() => {
        const selectedElement = dom_selection.focusNode.parentElement;
        if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }, 0);
    }
  }

  // Utils
  // --------------------------

  // function __is_element_before(reference_el, el) {
  //   return !!(reference_el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
  // }

  function __find_first_text_node(el) {
    if (el.nodeType === Node.TEXT_NODE) {
      return el;
    }
    
    for (let child of el.childNodes) {
      const textNode = __find_first_text_node(child);
      if (textNode) {
        return textNode;
      }
    }
  }

  function __find_last_text_node(el) {
    // If the element itself is a text node, return it
    if (el.nodeType === Node.TEXT_NODE) {
      return el;
    }
    
    // Iterate through child nodes in reverse order
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      const textNode = __find_last_text_node(el.childNodes[i]);
      if (textNode) {
        return textNode;
      }
    }
  }

  // Whenever the model selection changes, render the selection
  $effect(() => {
    render_selection();
  });
</script>

<svelte:document
  {onselectionchange}
  {onmousedown}
  {onmouseup}
/>
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