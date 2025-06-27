<script>
  import { setContext } from 'svelte';
  import { svid } from '$lib/util.js';

  let {
    doc,
    children,
    overlays,
    editable = false,
    ref = $bindable(),
    class: css_class,
  } = $props();

  // Expose focus_canvas method to parent component
  export { focus_canvas };

  let is_mouse_down = $state(false);

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
      const tr = doc.tr;
      tr.insert_text(inserted_char);
      doc.apply(tr);
    }
  }

  // Map DOM selection to internal model
  function onselectionchange(event) {
    const dom_selection = window.getSelection();
    if (!dom_selection.rangeCount) return;

    // Only handle selection changes if selection is within the canvas
    const range = dom_selection.getRangeAt(0);
    if (!ref?.contains(range.commonAncestorContainer)) return;
    let selection = __get_property_selection_from_dom() || __get_text_selection_from_dom() || __get_container_selection_from_dom();
    if (selection) {
      doc.selection = selection;
    }
  }


  function oncopy(event, delete_selection = false) {
    // Only handle copy events if focus is within the canvas
    if (!ref?.contains(document.activeElement)) return;

    event.preventDefault();
    event.stopPropagation();

    let plain_text, html, json_data;

    if (doc.selection?.type === 'text') {
      plain_text = doc.get_selected_plain_text();
      html = plain_text;
      console.log('selected_plain_text', plain_text);
    } else if (doc.selection?.type === 'container') {
      const selected_nodes = doc.get_selected_nodes();
      json_data = [];
      selected_nodes.forEach(node_id => {
        const node = doc.get(node_id);
        // On cut we keep the ids of the selection, on copy we generate new ids for the nodes to be pasted.
        const id = delete_selection ? node.id : svid();
        json_data.push({
          ...node,
          id,
        });
      });
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
      doc.apply(doc.tr.delete_selection());
    }
  }

  function oncut(event) {
    oncopy(event, true);
  }

  async function onpaste(event) {
    // Only handle paste events if focus is within the canvas
    if (!ref?.contains(document.activeElement)) return;

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
      doc.apply(doc.tr.insert_blocks(blocks));
    } else {
      const plain_text_blob = await clipboardItems[0].getType('text/plain');
      // Convert the Blob to text
      const plain_text = await plain_text_blob.text();
      doc.apply(doc.tr.insert_text(plain_text));
    }
  }

  function render_selection() {
    const selection = doc.selection;
    let prev_selection = __get_property_selection_from_dom() || __get_text_selection_from_dom() || __get_container_selection_from_dom();

    if (!selection) {
      // No model selection -> just leave things as they are'
      let dom_selection = window.getSelection();
      dom_selection.removeAllRanges();
      return;
    }

    // NOTE: Skip rerender only when the selection is the same and the focus is already within the canvas
    if (JSON.stringify(selection) === JSON.stringify(prev_selection) && ref?.contains(document.activeElement)) {
      // Skip. No need to rerender.
      return;
    }

    if (selection?.type === 'text') {
      __render_text_selection();
    } else if (selection?.type === 'container') {
      __render_container_selection();
    } else if (selection?.type === 'property') {
      __render_property_selection();
    } else {
      console.log('unsupported selection type', selection.type);
    }
  }

  function focus_toolbar() {
    // Find the first interactive element in the toolbar and focus it
    const toolbar = document.querySelector('.editor-toolbar');
    if (toolbar) {
      const firstInteractive = toolbar.querySelector('input, button, select, textarea');
      if (firstInteractive) {
        firstInteractive.focus();
      }
    }
  }

  function focus_canvas() {
    // We just render the selection (which will return focus to the canvas) implicitly
    render_selection();
  }

  function onkeydown(e) {
    // Only handle keyboard events if focus is within the canvas
    if (!ref?.contains(document.activeElement)) return;

    const selection = doc.selection;
    const isCollapsed = selection.anchor_offset === selection.focus_offset;
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
      doc.apply(doc.tr.insert_text('\n'));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      doc.apply(doc.tr.annotate_text('strong'));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
      doc.apply(doc.tr.annotate_text('emphasis'));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      doc.apply(doc.tr.annotate_text('link', {
        href: window.prompt('Enter the URL', 'https://example.com')
      }));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Backspace') {
      if (selection?.type === 'property') {
        // For property selections, clear the property value only if it's not already falsy
        if (doc.get(selection.path)) {
          const tr = doc.tr;
          tr.set(selection.path, '');
          doc.apply(tr);
        }
      } else {
        // For other selections, use the normal delete behavior
        doc.apply(doc.tr.delete_selection());
      }
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'property') {
      // Focus toolbar for property selections
      focus_toolbar();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'container') {

      const spanLength = Math.abs(selection.focus_offset - selection.anchor_offset);

      if (isCollapsed || spanLength === 1) {
        focus_toolbar();
      }
      // Container selections with multiple nodes do nothing on Enter
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection.type === 'text') {
      const text_content = doc.get(selection.path)[0];
      const cursor_at_end = isCollapsed && text_content.length === selection.focus_offset;
      if (cursor_at_end) {
        // "path": [
        //   "atzVDeKmJwyzGZzfmmXPSkx",
        //   "body",
        //   "2",
        //   "description"
        // ],
        //
        const base_node = doc.get(selection.path.slice(0, -3));
        const container_prop = selection.path.at(-3);

        const target_node_type = doc.schema[base_node.type][container_prop].default_ref_type;

        const next_insert_position = {
          type: 'container',
          path: selection.path.slice(0, -2),
          anchor_offset: parseInt(selection.path.at(-2), 10) + 1,
          focus_offset: parseInt(selection.path.at(-2), 10) + 1,
        };

        const tr = doc.tr;
        tr.set_selection(next_insert_position);
        doc.config.inserters[target_node_type](tr, [...selection.path.slice(0, -2), next_insert_position.anchor_offset]);
        doc.apply(tr);
      }

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

    // If focus_node or anchor_node is a text node, we need to use the parent element,
    // so we can perform the closest() query on it
    if (!focus_node.closest) focus_node = focus_node.parentElement;
    if (!anchor_node.closest) anchor_node = anchor_node.parentElement;

    // EDGE CASE: Let's first check if we are in a cursor trap for container cursors
    let after_node_cursor_trap = focus_node.closest('[data-type="after-node-cursor-trap"]');
    if (after_node_cursor_trap && focus_node === anchor_node) {
      // Find the block that this cursor trap belongs to
      let block = after_node_cursor_trap.closest('[data-type="block"]');
      if (!block) {
        console.log('No corresponding block found for after-node-cursor-trap');
        return null;
      }
      const block_path = block.dataset.path.split('.');
      const block_index = parseInt(block_path.at(-1));
      const result = {
        type: 'container',
        path: block_path.slice(0, -1),
        anchor_offset: block_index + 1,
        focus_offset: block_index + 1,
      }
      return result;
    }

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
      if (!focus_root) return null;
      focus_root_path = focus_root.dataset.path.split('.');
    } else if (anchor_root_path.length > focus_root_path.length) {
      anchor_root = anchor_root.parentElement.closest('[data-path][data-type="block"]');
      if (!anchor_root) return null;
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

  function __get_property_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    let focus_root = dom_selection.focusNode.parentElement?.closest('[data-path][data-type="property"]');
    if (!focus_root) return null;
    let anchor_root = dom_selection.anchorNode.parentElement?.closest('[data-path][data-type="property"]');
    if (!anchor_root) return null;

    if (focus_root === anchor_root) {
      return {
        type: 'property',
        path: focus_root.dataset.path.split('.')
      }
    }
    return null;
  }

  function __get_text_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    let focus_root, anchor_root;

    if (dom_selection.focusNode === dom_selection.anchorNode && dom_selection.focusNode.dataset?.type === 'text') {
      // This is the case when the text node is empty (only a <br> is present)
      focus_root = anchor_root = dom_selection.focusNode;
    } else {
      focus_root = dom_selection.focusNode.parentElement?.closest('[data-path][data-type="text"]');
      if (!focus_root) return null;
      anchor_root = dom_selection.anchorNode.parentElement?.closest('[data-path][data-type="text"]');
      if (!anchor_root) return null;
    }


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
    const is_backward = dom_selection.anchorNode === range.endContainer &&
                      dom_selection.anchorOffset === range.endOffset;

    // Swap offsets if it's a backward selection
    if (is_backward) {
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
    // console.log('render_container_selection', $state.snapshot(doc.selection));
    const selection = doc.selection;
    const container = doc.get(selection.path);
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
      console.log('collapsed selection', selection.anchor_offset, selection.focus_offset)
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

  function __render_property_selection() {
    const selection = doc.selection;
    // The element that holds the property
    const el = ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="property"]`);
    const cursor_trap = el.querySelector('.cursor-trap');

    const range = window.document.createRange();
    const dom_selection = window.getSelection();

    // Select the entire cursor trap element contents and collapse to start
    range.selectNodeContents(cursor_trap);
    range.collapse(true); // Collapse to start position
    dom_selection.removeAllRanges();
    dom_selection.addRange(range);
  }

  function __render_text_selection() {
    const selection = doc.selection;
    // The element that holds the annotated text
    const el = ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="text"]`);
    const empty_text = doc.get(selection.path)[0].length === 0;

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

    // EDGE CASE: When text is empty, we need to set a different DOM selection
    if (start_offset === end_offset && start_offset === 0 && empty_text) {
      // Markup for empty text looks like this `<div data-type="text"><br></div>`.
      // And the correct cursor position is after the <br> element.
      anchorNode = el;
      anchorNodeOffset = 1;
      focusNode = el;
      focusNodeOffset = 1;
    } else {
      // DEFAULT CASE
      for (const childNode of el.childNodes) {
        if (processNode(childNode)) break;
      }

      // EDGE CASE: cursor at the end of an annotation
      if (anchorNode && !focusNode && currentOffset === end_offset) {
        focusNode = anchorNode.nextSibling || anchorNode;
        focusNodeOffset = focusNode === anchorNode ? anchorNode.length : 0;
      }
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
    class:hide-selection={doc.selection?.type === 'container'}
    bind:this={ref}
    {onbeforeinput}
    contenteditable={editable ? 'true' : 'false'}
  >
    {@render children()}
  </div>
  <div class="svedit-overlays">
    {@render overlays()}
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

  .svedit-canvas.hide-selection {
		caret-color: transparent;
	}

	.svedit-canvas :global(::selection) {
		background: var(--editing-fill-color);
	}

	/* .svedit-canvas.hide-selection :global(::selection) {
    background: transparent;
  } */
</style>
