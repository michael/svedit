<script>
  import { setContext } from 'svelte';
  import Icon from '$lib/Icon.svelte';

  let {
    document,
    children,
    editable = false,
    ref = $bindable(),
    class: css_class,
  } = $props();

  let is_mouse_down = $state(false);
  let container_selection_paths = $derived(get_container_selection_paths());
  let container_cursor_info = $derived(get_container_cursor_info());
  let text_selection_info = $derived(get_text_selection_info());

  function get_container_selection_paths() {
    const paths = [];
    const sel = document.selection;
    if (!sel) return;
    
    // Container selection. Not collapsed.
    if (sel.type === 'container' && sel.anchor_offset !== sel.focus_offset) {
      const start = Math.min(sel.anchor_offset, sel.focus_offset);
      const end = Math.max(sel.anchor_offset, sel.focus_offset);

      for (let index = start; index < end; index++) {
        paths.push([...sel.path, index]);
      }
      return paths;
    }
  }

  function get_container_cursor_info() {
    const sel = document.selection;
    if (!sel) return;

    if (sel.type === 'container' && sel.anchor_offset === sel.focus_offset) {
      const container = document.get(sel.path);
      let block_index, position;

      if (sel.anchor_offset === container.length) {
        // Edge case: Cursor is at the very end
        block_index = sel.anchor_offset - 1;
        position = 'after';
      } else {
        block_index = sel.anchor_offset;
        position = 'before';
      }

      return {
        path: [...sel.path, block_index],
        position,
      }
    }
  }

  function get_text_selection_info() {
    const sel = document.selection;
    if (!sel || sel.type !== 'text') return null;

    const active_annotation = document.active_annotation();
    if (active_annotation && active_annotation[2] === 'link') {
      const annotated_text = document.get(sel.path);
      const annotation_index = annotated_text[1].indexOf(active_annotation);
      return {
        path: sel.path,
        annotation: active_annotation,
        annotation_index: annotation_index
      };
    }
    return null;
  }

  function open_link() {
    if (text_selection_info?.annotation?.[3]?.href) {
      window.open(text_selection_info.annotation[3].href, '_blank');
    }
  }

  setContext("svedit", {
    get document() {
      return document;
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
      document.insert_text(inserted_char);
    }
  }

  // Map selection to model
  function onselectionchange(event) {
    let selection = __get_text_selection_from_dom() || __get_container_selection_from_dom();
    // console.log('latest selection from dom', JSON.stringify(selection));
    if (selection) {
      document.selection = selection;
    }
  }


  function oncopy(event, delete_selection = false) {
    event.preventDefault();
    event.stopPropagation();

    let plain_text, html, json_data;

    if (document.selection?.type === 'text') {
      plain_text = document.get_selected_plain_text();
      html = plain_text;
      console.log('selected_plain_text', plain_text);
    } else if (document.selection?.type === 'container') {
      const selected_blocks = document.get_selected_blocks();
      json_data = selected_blocks;
    }

    // Create a ClipboardItem with multiple formats
    const data = {
      'text/plain': new Blob([plain_text], {type: 'text/plain'}),
      'text/html': new Blob([html], {type: 'text/html'}),
    };

    if (json_data) {
      const json_blob = new Blob([JSON.stringify(json_data)], {type: 'application/json'});
      data['web application/json'] = json_blob;
    }
    const clipboard_item_raw = new ClipboardItem(data);

    // Write to clipboard
    navigator.clipboard.write([clipboard_item_raw]).then(() => {
      console.log('Data copied to clipboard successfully');
    }).catch(err => {
      console.error('Failed to copy data: ', err);
    });

    if (delete_selection) {
      document.delete();
    }
  }

  function oncut(event) {
    oncopy(event, true);
  }

  async function onpaste(event) {
    event.preventDefault();
    const clipboardItems = await navigator.clipboard.read();

    let pasted_json;

    // Wrapping this in a try-catch as this API only works in Chrome. We fallback to 
    // plaintext copy and pasting for all other situations.
    try {
      const json_blob = await clipboardItems[0].getType('web application/json');
      pasted_json = JSON.parse(await json_blob.text());
    } catch(e) {}
    if (pasted_json) {
      // ATM we assume when we get JSON, that we are dealing with a sequence of blocks that was copied
      const blocks = pasted_json;
      document.insert_blocks(blocks);
    } else {
      const plain_text_blob = await clipboardItems[0].getType('text/plain');
      // Convert the Blob to text
      const plain_text = await plain_text_blob.text();
      document.insert_text(plain_text);
    }
  }

  function render_selection() {
    const selection = document.selection;
    let prev_selection = __get_text_selection_from_dom() || __get_container_selection_from_dom();

    if (!selection) {
      // No model selection -> just leave things as they are'
      let dom_selection = window.getSelection();
      dom_selection.removeAllRanges();
      return;
    }

    if (JSON.stringify(selection) === JSON.stringify(prev_selection)) {
      // Skip. No need to rerender.
      return;
    }
    
    if (selection?.type === 'text') {
      __render_text_selection();
    } else if (selection?.type === 'container') {
      __render_container_selection();
    } else {
      console.log('unsupported selection type', selection.type);
    }
  }

  function onkeydown(e) {
    const selection = document.selection;
    // console.log('onkeydown', e.key);
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      document.undo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      document.redo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.insert_text('\n');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      document.annotate_text('strong');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
      document.annotate_text('emphasis');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      document.annotate_text('link', {
        href: window.prompt('Enter the URL', 'https://example.com')
      });
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Backspace') {
      document.delete();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'container') {
      const path = selection.path;
      // HACK: we need a way to generalize insertion. Possibly we need
      // a bit of schema introspection. E.g. to determine the default_block_type
      // based on a certain context
      if (path.at(-1) === 'items') {
        document.insert_blocks([
          {
            type: 'list',
            description: ['enter description', []],
          }
        ]);
      } else {
        document.insert_blocks([
          {
            type: 'story',
            image: '/images/container-cursors.svg',
            title: ['Enter title', []],
            description: ['Enter a description', []],
          }
        ]);
      }

      e.preventDefault();
      e.stopPropagation();
    // Because of specificity, this has to come before the other arrow key checks
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.metaKey || e.ctrlKey) && selection?.type === 'container') {
      if (e.key === 'ArrowUp') {
        document.move_up();
      } else {
        document.move_down();
      }
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowDown') && !e.shiftKey && selection?.type === 'container') {
      document.move_container_cursor('forward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowUp') && !e.shiftKey && selection?.type === 'container') {
      document.move_container_cursor('backward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowDown') && e.shiftKey && selection?.type === 'container') {
      document.expand_container_selection('forward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowUp') && e.shiftKey && selection?.type === 'container') {
      document.expand_container_selection('backward');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Escape' && selection) {
      document.select_parent();
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

    // Check if it's a backwards selection
    const is_backwards = __is_dom_selection_backwards();
    if (is_backwards) {
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

    const blockElements = containerEl.children;
    if (blockElements.length === 0) return null;

    return blockElements[block_offset];
  }

  function __is_selection_collapsed(sel) {
    return sel.anchor_offset === sel.focus_offset;
  }

  function __render_container_selection() {
    // console.log('render_container_selection', $state.snapshot(document.selection));
    const selection = document.selection;
    const container = document.get(selection.path);
    const container_path = selection.path.join('.');

    // we need to translate the cusor offset to block offsets now
    let anchor_block_offset = selection.anchor_offset > selection.focus_offset ? selection.anchor_offset - 1 : selection.anchor_offset;
    let focus_block_offset = selection.focus_offset > selection.anchor_offset ? selection.focus_offset - 1 : selection.focus_offset;
    const anchor_node = __get_block_element(container_path, anchor_block_offset);
    const focus_node = __get_block_element(container_path, focus_block_offset);

    if (!anchor_node || !focus_node) return;
    const dom_selection = window.getSelection();
    const range = window.document.createRange();

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
        // Backwards selection
        let last_text_node = __find_last_text_node(anchor_node);
        let first_text_node = __find_first_text_node(focus_node);

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
        // Regular foward selection
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
    const selection = document.selection;
    // The element that holds the annotated text
    const el = ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="text"]`);

    const range = window.document.createRange();
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

  function __is_dom_selection_backwards() {
    const dom_selection = window.getSelection();
    
    // If there's no dom_selection, return false
    if (dom_selection.rangeCount === 0) return false;

    // Get the range of the dom_selection
    const range = dom_selection.getRangeAt(0);

    if (range.collapsed) return false;

    // Create a new range for comparison
    const comparisonRange = range.cloneRange();

    // Set the comparison range to start at the dom_selection's anchor and end at its focus
    comparisonRange.setStart(dom_selection.anchorNode, dom_selection.anchorOffset);
    comparisonRange.setEnd(dom_selection.focusNode, dom_selection.focusOffset);

    // If the comparison range is collapsed, the selection is backwards
    return comparisonRange.collapsed;
  }

  // Whenever the model selection changes, render the selection
  $effect(() => {
    render_selection();
  });
</script>

<!--
  TODO: We must get rid of the global handlers here, so Svedit doesn't conflict
  with any app-specific event handling.
-->
<svelte:document
  {onselectionchange}
  {onmousedown}
  {onmouseup}
  {oncut}
  {oncopy}
  {onpaste}
/>
<svelte:window {onkeydown} />

<!-- TODO: move oncut/copy/paste handlers inside .svedit -->
<div
  class="svedit"
>
  <div
    class="svedit-canvas {css_class}"
    class:hide-selection={document.selection?.type === 'container'}
    bind:this={ref}
    {onbeforeinput}
    contenteditable={editable ? 'true' : 'false'}
  >
    {@render children()}
  </div>
  <div class="svedit-overlays">
    <!-- Here we render  and other stuff that should lay atop of the canvas -->
    <!-- NOTE: we are using CSS Anchor Positioning, which currently only works in the latest Chrome browser -->
    {#if container_selection_paths}
      <!-- Render container selection fragments (one per selected block)-->
      {#each container_selection_paths as path}
        <div class="container-selection-fragment" style="position-anchor: --{path.join('-')};"></div>
      {/each}
    {:else if container_cursor_info}
      <div
        class="container-cursor"
        class:after={container_cursor_info.position === 'after'}
        class:before={container_cursor_info.position === 'before'}
        style="position-anchor: --{container_cursor_info.path.join('-')};"
      ></div>
    {/if}
    
    {#if text_selection_info}
      <div
        class="text-selection-overlay"
        style="position-anchor: --{text_selection_info.path.join('-') + '-' + text_selection_info.annotation_index};"
      >
        <button onclick={open_link} class="small"><Icon name="external-link" /></button>
      </div>
    {/if}
  </div>
</div>

<style>
  .svedit-canvas {
    caret-color: var(--editing-stroke-color);
    caret-shape: block;
    &:focus {
      outline: none;
    }
  }

  /* This should be an exact overlay */
  .container-selection-fragment {
    position: absolute;
    background:  var(--editing-fill-color);
    border: 1px solid var(--editing-stroke-color);
    border-radius: 2px;
    
    top: anchor(top);
    left: anchor(left);
    bottom: anchor(bottom);
    right: anchor(right);
    pointer-events: none;
  }

  .container-cursor {
    position: absolute;
    background:  var(--editing-stroke-color);
    height: 2px;
    left: anchor(left);
    right: anchor(right);
    pointer-events: none;
    animation: blink 0.7s infinite;
  }

  .container-cursor.before {
    top: anchor(top);
  }

  .container-cursor.after {
    bottom: anchor(bottom);
  }

  @keyframes blink {
    0% {
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .svedit-canvas.hide-selection {
    caret-color: transparent;
  }

  .svedit-canvas :global(::selection) {
    background: var(--editing-fill-color);
  }

  /* div.hide-selection :global(::selection) {
    background: transparent;
  } */

  .text-selection-overlay {
    position: absolute;
    top: anchor(top);
    left: anchor(right);
    pointer-events: auto;
    transform: translateX(var(--s-1)) translateY(-12px);
    z-index: 10;
  }

  .text-selection-overlay button {
    color: var(--primary-text-color);
    --icon-color: var(--primary-text-color);
    box-shadow: var(--shadow-2);
  }
</style>
