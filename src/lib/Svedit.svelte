<script>
  import { setContext } from 'svelte';
  import Icon from '$lib/Icon.svelte';

  let {
    doc,
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
    const sel = doc.selection;
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
    const sel = doc.selection;
    if (!sel) return;

    if (sel.type === 'container' && sel.anchor_offset === sel.focus_offset) {
      const container = doc.get(sel.path);
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
    const sel = doc.selection;
    if (!sel || sel.type !== 'text') return null;

    const active_annotation = doc.active_annotation();
    if (active_annotation && active_annotation[2] === 'link') {
      const annotated_text = doc.get(sel.path);
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
    get doc() {
      return doc;
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
      doc.insert_text(inserted_char);
    }
  }

  // Map selection to model
  function onselectionchange(event) {
    let selection = __get_text_selection_from_dom() || __get_container_selection_from_dom();
    // console.log('latest selection from dom', JSON.stringify(selection));
    if (selection) {
      doc.selection = selection;
    }
  }


  function oncopy(event, delete_selection = false) {
    event.preventDefault();
    event.stopPropagation();

    let plain_text, html, json_data;

    if (doc.selection?.type === 'text') {
      plain_text = doc.get_selected_plain_text();
      html = plain_text;
      console.log('selected_plain_text', plain_text);
    } else if (doc.selection?.type === 'container') {
      const selected_blocks = doc.get_selected_blocks();
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
      doc.delete();
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
      doc.insert_blocks(blocks);
    } else {
      const plain_text_blob = await clipboardItems[0].getType('text/plain');
      // Convert the Blob to text
      const plain_text = await plain_text_blob.text();
      doc.insert_text(plain_text);
    }
  }

  function render_selection() {
    const selection = doc.selection;
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
    const selection = doc.selection;
    // console.log('onkeydown', e.key);
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      doc.undo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      doc.redo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      doc.insert_text('\n');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      doc.annotate_text('strong');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
      doc.annotate_text('emphasis');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      doc.annotate_text('link', {
        href: window.prompt('Enter the URL', 'https://example.com')
      });
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Backspace') {
      doc.delete();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'container') {
      const path = selection.path;
      // HACK: we need a way to generalize insertion. Possibly we need
      // a bit of schema introspection. E.g. to determine the default_block_type
      // based on a certain context
      if (path.at(-1) === 'items') {
        doc.insert_blocks([
          {
            type: 'list',
            description: ['enter description', []],
          }
        ]);
      } else {
        doc.insert_blocks([
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
        doc.move_up();
      } else {
        doc.move_down();
      }
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowDown') && !e.shiftKey && selection?.type === 'container') {
      doc.move_container_cursor('forward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowUp') && !e.shiftKey && selection?.type === 'container') {
      doc.move_container_cursor('backward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowDown') && e.shiftKey && selection?.type === 'container') {
      doc.expand_container_selection('forward');
      e.preventDefault();
      e.stopPropagation();
    } else if ((e.key === 'ArrowUp') && e.shiftKey && selection?.type === 'container') {
      doc.expand_container_selection('backward');
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Escape' && selection) {
      doc.select_parent();
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

    // Get the container element that holds the blocks
    const container_el = ref.querySelector('[data-type="container"]');
    if (!container_el) return null;

    // Get the container path from the data-path attribute
    const container_path = container_el.dataset.path ? container_el.dataset.path.split('.') : [];
    
    // Get all block elements within the container
    const block_elements = Array.from(container_children(container_el));
    
    // Find the focused and anchored blocks using their data-path attributes
    const focus_block = focus_node.closest('[data-path]');
    const anchor_block = anchor_node.closest('[data-path]');
    
    if (!focus_block || !anchor_block) return null;
    
    // Get the full paths of the blocks
    const focus_path = focus_block.dataset.path ? focus_block.dataset.path.split('.') : [];
    const anchor_path = anchor_block.dataset.path ? anchor_block.dataset.path.split('.') : [];
    
    // Find the indices of the blocks in the container by matching their full paths
    const focus_index = block_elements.findIndex(el => {
      const el_path = el.dataset.path ? el.dataset.path.split('.') : [];
      return el_path.join('.') === focus_path.join('.');
    });
    
    const anchor_index = block_elements.findIndex(el => {
      const el_path = el.dataset.path ? el.dataset.path.split('.') : [];
      return el_path.join('.') === anchor_path.join('.');
    });
    
    if (focus_index === -1 || anchor_index === -1) return null;
    
    // Check if it's a backwards selection
    const is_backwards = __is_dom_selection_backwards();
    
    // Determine the selection range
    let start_index, end_index;
    if (is_backwards) {
      start_index = Math.min(focus_index, anchor_index);
      end_index = Math.max(focus_index, anchor_index) + 1; // +1 because selection is exclusive at the end
    } else {
      start_index = Math.min(focus_index, anchor_index);
      end_index = Math.max(focus_index, anchor_index) + 1; // +1 because selection is exclusive at the end
    }

    return {
      type: 'container',
      path: container_path,
      anchor_offset: is_backwards ? end_index : start_index,
      focus_offset: is_backwards ? start_index : end_index,
    };
  }
  
  // Helper function to get direct children of a container, skipping any nested containers
  function container_children(container) {
    return Array.from(container.children).filter(child => 
      child.hasAttribute('data-id') || child.querySelector('[data-id]')
    );
  }

  function __get_text_selection_from_dom() {
    try {
      const dom_selection = window.getSelection();
      if (!dom_selection || dom_selection.rangeCount === 0) return null;

      // Helper function to safely get the closest element with data-path
      const getClosestPathElement = (node) => {
        try {
          if (!node) return null;
          
          let element = node;
          
          // If it's a text node, get its parent element
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.parentElement) return null;
            element = node.parentElement;
          }
          
          // Ensure we have an element node
          if (element.nodeType !== Node.ELEMENT_NODE) return null;
          
          // Find the closest element with data-path
          return element.closest('[data-path]');
        } catch (error) {
          console.error('Error in getClosestPathElement:', error);
          return null;
        }
      };

      // Get the closest elements with data-path
      const focus_element = getClosestPathElement(dom_selection.focusNode);
      const anchor_element = getClosestPathElement(dom_selection.anchorNode);
      
      // If we can't find elements or the selection spans multiple paths, return null
      if (!focus_element || !anchor_element) return null;
      
      // Get the hierarchical path from the data-path attribute
      const focus_path = focus_element.dataset?.path?.split('.') || [];
      const anchor_path = anchor_element.dataset?.path?.split('.') || [];
      
      // For now, we only support selections within the same text field
      if (focus_path.join('.') !== anchor_path.join('.')) return null;
      
      // Find the text element within the block
      const text_el = dom_selection.focusNode.nodeType === Node.ELEMENT_NODE 
        ? dom_selection.focusNode.closest('[data-type="text"]')
        : dom_selection.focusNode.parentElement?.closest('[data-type="text"]');
      
      if (!text_el) return null;
      
      const range = dom_selection.getRangeAt(0);
      const text_content = text_el.textContent || '';
      
      // Get the offset of the selection within the text element
      const range_start = range.startContainer === text_el
        ? range.startOffset
        : range.startOffset + (range.startContainer.textContent?.substring(0, range.startOffset).length || 0);
        
      const range_end = range.endContainer === text_el
        ? range.endOffset
        : range.endOffset + (range.endContainer.textContent?.substring(0, range.endOffset).length || 0);
      
      // Ensure the range is ordered correctly (start <= end)
      const [start, end] = range_start <= range_end 
        ? [range_start, range_end] 
        : [range_end, range_start];
      
      // If the selection is collapsed, return null
      if (start === end) return null;
      
      // Check if it's a backward selection
      const is_backward = dom_selection.anchorNode === range.endContainer && 
                        dom_selection.anchorOffset === range.endOffset;

      return {
        type: 'text',
        path: focus_path,
        start: is_backward ? end : start,
        end: is_backward ? start : end,
        text: text_content.substring(start, end)
      };
      
    } catch (error) {
      console.error('Error in __get_text_selection_from_dom:', error);
      return null;
    }
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
    const selection = doc.selection;
    if (!selection) return;
    
    const container = doc.get(selection.path);
    if (!container) {
      console.error('Container not found for path:', selection.path);
      return;
    }
    
    // Find the container element by its data-path
    const container_path_str = selection.path.join('.');
    const container_el = ref.querySelector(`[data-path="${container_path_str}"][data-type="container"]`);
    if (!container_el) {
      console.error('Container element not found in DOM for path:', container_path_str);
      return;
    }
    
    // Get all block elements within the container
    const block_elements = Array.from(container_children(container_el));
    
    // Get the start and end indices for the selection
    const start = Math.min(selection.anchor_offset, selection.focus_offset);
    const end = Math.max(selection.anchor_offset, selection.focus_offset);
    
    // Get the anchor and focus nodes based on the selection direction
    const anchor_node = block_elements[start === selection.anchor_offset ? start : end - 1];
    const focus_node = block_elements[start === selection.anchor_offset ? end - 1 : start];
    
    if (!anchor_node || !focus_node) {
      console.error('Anchor or focus node not found in DOM');
      return;
    }
    
    const dom_selection = window.getSelection();
    const range = window.document.createRange();
    
    if (selection.anchor_offset === selection.focus_offset) {
      // Collapsed selection (cursor between blocks)
      if (selection.anchor_offset >= block_elements.length) {
        // Cursor at the end of the container
        if (block_elements.length > 0) {
          range.setStartAfter(block_elements[block_elements.length - 1]);
          range.setEndAfter(block_elements[block_elements.length - 1]);
        } else {
          // Empty container, set range inside the container
          range.setStart(container_el, 0);
          range.setEnd(container_el, 0);
        }
      } else {
        // Cursor before a block
        range.setStartBefore(block_elements[selection.anchor_offset]);
        range.setEndBefore(block_elements[selection.anchor_offset]);
      }
      dom_selection.removeAllRanges();
      dom_selection.addRange(range);
    } else {
      // Non-collapsed selection
      if (selection.anchor_offset > selection.focus_offset) {
        // Backwards selection
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
        
        // Set the selection direction to backwards
        dom_selection.setBaseAndExtent(last_text_node, last_text_node.length, first_text_node, 0);
      } else {
        // Regular forward selection
        range.setStart(anchor_node, 0);
        range.setEnd(focus_node, focus_node.childNodes.length);
        dom_selection.removeAllRanges();
        dom_selection.addRange(range);
      }
    }
    
    // Ensure the container is focused
    container_el.focus();
    
    // Scroll the selection into view
    setTimeout(() => {
      const node_to_scroll = selection.anchor_offset > selection.focus_offset ? focus_node : anchor_node;
      if (node_to_scroll) {
        node_to_scroll.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }

  function __render_text_selection() {
    const selection = doc.selection;
    if (!selection) return;
    
    // The path is a hierarchical path like ['page_1', 'body', 0, 'title']
    const path = selection.path;
    const path_str = path.join('.');
    
    // Find the text element by its data-path attribute
    const text_el = ref.querySelector(`[data-path="${path_str}"][data-type="text"]`);
    if (!text_el) {
      console.error('Text element not found for path:', path_str);
      return;
    }

    const range = window.document.createRange();
    const dom_selection = window.getSelection();
    let currentOffset = 0;
    let anchorNode = null, anchorNodeOffset = 0, focusNode = null, focusNodeOffset = 0;
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
        return false;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip processing if this is a non-text element with data-type attribute
        if (node.hasAttribute('data-type') && node.getAttribute('data-type') !== 'text') {
          return false;
        }
        
        // Process child nodes
        for (const childNode of node.childNodes) {
          if (processNode(childNode)) return true;
        }
      }
      return false; // Continue iteration
    }

    // Iterate through direct child nodes of the text element
    for (const childNode of text_el.childNodes) {
      if (processNode(childNode)) break;
    }

    // Handle edge case: cursor at the end of the text
    if (anchorNode && !focusNode && currentOffset === end_offset) {
      focusNode = anchorNode.nextSibling || anchorNode;
      focusNodeOffset = focusNode === anchorNode ? anchorNode.length : 0;
    }

    // Set the range if both start and end were found
    if (anchorNode && focusNode) {
      try {
        range.setStart(anchorNode, Math.min(anchorNodeOffset, anchorNode.length));
        range.setEnd(focusNode, Math.min(focusNodeOffset, focusNode.length || 0));
        
        dom_selection.removeAllRanges();
        dom_selection.addRange(range);
        
        // Set the selection direction for backward selections
        if (is_backward) {
          dom_selection.extend(focusNode, focusNodeOffset);
        }
        
        // Focus the text element
        text_el.focus();
        
        // Scroll the selection into view
        setTimeout(() => {
          const selectedElement = dom_selection.focusNode?.parentElement || text_el;
          if (selectedElement) {
            selectedElement.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      } catch (e) {
        console.error('Error setting text selection range:', e);
      }
    }
  }

  // Utils
  // --------------------------

  function __find_first_text_node(el) {
    if (!el) return null;
    
    if (el.nodeType === Node.TEXT_NODE) {
      return el;
    }
    
    // Skip elements with data-type that's not 'text'
    if (el.nodeType === Node.ELEMENT_NODE && 
        el.hasAttribute('data-type') && 
        el.getAttribute('data-type') !== 'text') {
      return null;
    }
    
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      const textNode = __find_first_text_node(child);
      if (textNode) {
        return textNode;
      }
    }
    return null;
  }

  function __find_last_text_node(el) {
    if (!el) return null;
    
    // If the element itself is a text node, return it
    if (el.nodeType === Node.TEXT_NODE) {
      return el;
    }
    
    // If this is a non-text element with data-type, skip it
    if (el.nodeType === Node.ELEMENT_NODE && 
        el.hasAttribute('data-type') && 
        el.getAttribute('data-type') !== 'text') {
      return null;
    }
    
    // Check children in reverse order to find the last text node
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      const textNode = __find_last_text_node(el.childNodes[i]);
      if (textNode) {
        return textNode;
      }
    }
    
    return null;
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
    class:hide-selection={doc.selection?.type === 'container'}
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
