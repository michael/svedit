<script>
  import { setContext } from 'svelte';
  import { snake_to_pascal } from './util.js';
  import { break_text_node, join_text_node, insert_default_node, select_all } from './commands.svelte.js';

  /** @import { SveditProps, DocumentPath, Selection, TextSelection, NodeSelection, PropertySelection, NodeId } from './types.d.ts'; */
  /** @type {SveditProps} */
  let {
    doc,
    editable = false,
    path,
    class: css_class,
  } = $props();

  let canvas_ref;
  let root_node = $derived(doc.get(path));
  let Overlays = $derived(doc.config.system_components.Overlays);
  let RootComponent = $derived(doc.config.node_components[snake_to_pascal(root_node.type)]);
  
  // Track composition state for input methods like dead keys
  let composition_start_offset = null;
  let is_composing = false;

  /** Expose function so parent can call it */
  export { focus_canvas };

  setContext("svedit", {
    get doc() {
      return doc;
    }
  });

  /**
   * @param {InputEvent} event
   */
  function onbeforeinput(event) {
    // Skip processing during composition to avoid conflicts
    if (is_composing) {
      return;
    }

    const inserted_char = event.data;

    event.preventDefault();
    if (inserted_char) {
      const tr = doc.tr;
      tr.insert_text(inserted_char);
      doc.apply(tr);
    }
  }

  // Map DOM selection to internal model
  function onselectionchange() {
    const dom_selection = window.getSelection();
    if (!dom_selection.rangeCount) return;

    // Only handle selection changes if selection is within the canvas
    const range = dom_selection.getRangeAt(0);
    if (!canvas_ref?.contains(range.commonAncestorContainer)) return;
    let selection = __get_property_selection_from_dom() || __get_text_selection_from_dom() || __get_node_selection_from_dom();
    if (selection) {
      doc.selection = selection;
    }
  }


  /**
   * @param {NodeId[]} selected_node_ids
   */
  function prepare_copy_payload(selected_node_ids) {
    const nodes = {};

    // Get subgraph for each selected node using doc.traverse()
    for (const node_id of selected_node_ids) {
      const subgraph = doc.traverse(node_id);

      // Add all nodes from this subgraph to our nodes collection
      for (const node of subgraph) {
        if (!nodes[node.id]) {
          nodes[node.id] = node;
        }
      }
    }

    // Keep original IDs - we'll generate new ones during paste
    return { nodes, main_nodes: selected_node_ids };
  }


  /**
   * @param {ClipboardEvent} event
   * @param {boolean} delete_selection - used by oncut()
   */
  function oncopy(event, delete_selection = false) {
    // Only handle copy events if focus is within the canvas
    if (!canvas_ref?.contains(document.activeElement)) return;

    event.preventDefault();
    event.stopPropagation();

    let plain_text, html, json_data;

    if (doc.selection?.type === 'text') {
      plain_text = doc.get_selected_plain_text();
      html = plain_text;
    } else if (doc.selection?.type === 'node') {
      const selected_nodes = doc.get_selected_nodes();
      const { nodes, main_nodes } = prepare_copy_payload(selected_nodes);

      json_data = { nodes, main_nodes };

      console.log('Copy operation:', {
        selected_nodes,
        main_nodes,
        total_nodes: Object.keys(nodes).length,
        operation: delete_selection ? 'cut' : 'copy'
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
    if (!canvas_ref?.contains(document.activeElement)) return;

    event.preventDefault();
    const clipboardItems = await navigator.clipboard.read();

    let pasted_json;

    // Wrapping this in a try-catch as this API only works in Chrome. We fallback to
    // plaintext copy and pasting for all other situations.
    try {
      const json_blob = await clipboardItems[0].getType('web application/json');
      pasted_json = JSON.parse(await json_blob.text());
    } catch {
      pasted_json = undefined;
    }

    if (pasted_json) {
      const tr = doc.tr;

      // Handle new format: { nodes: {id -> node}, main_nodes: [id1, id2, ...] }
      if (pasted_json.nodes && pasted_json.main_nodes) {
        const { nodes, main_nodes } = pasted_json;

        // Generate new IDs for all nodes during paste
        const id_mapping = {};
        for (const node_id in nodes) {
          id_mapping[node_id] = doc.generate_id();
        }

        // Create nodes with new IDs and updated references
        const updated_nodes = {};
        for (const [old_id, node] of Object.entries(nodes)) {
          const new_node = { ...node };
          new_node.id = id_mapping[old_id];

          // Update all property references to use new IDs
          for (const [property, value] of Object.entries(new_node)) {
            if (property === 'id' || property === 'type') continue;

            const prop_type = doc.schema[node.type]?.[property]?.type;

            if (prop_type === 'node_array' && Array.isArray(value)) {
              new_node[property] = value.map(ref_id => id_mapping[ref_id] || ref_id);
            } else if (prop_type === 'node' && typeof value === 'string') {
              new_node[property] = id_mapping[value] || value;
            }
          }

          updated_nodes[new_node.id] = new_node;
        }

        // Create all nodes first
        for (const node of Object.values(updated_nodes)) {
          tr.create(node);
        }

        // Then insert the main nodes at the current selection
        const new_main_nodes = main_nodes.map(id => id_mapping[id]);
        const main_node_objects = new_main_nodes.map(id => updated_nodes[id]);
        tr.insert_nodes(main_node_objects);
      }

      doc.apply(tr);
    } else {
      const plain_text_blob = await clipboardItems[0].getType('text/plain');
      // Convert the Blob to text
      const plain_text = await plain_text_blob.text();
      doc.apply(doc.tr.insert_text(plain_text));
    }
  }

  function render_selection() {
    const selection = /** @type {Selection} */ (doc.selection);
    let prev_selection = __get_property_selection_from_dom() || __get_text_selection_from_dom() || __get_node_selection_from_dom();

    if (!selection) {
      // No model selection -> just leave things as they are'
      let dom_selection = window.getSelection();
      dom_selection.removeAllRanges();
      return;
    }

    // NOTE: Skip rerender only when the selection is the same and the focus is already within the canvas
    if (JSON.stringify(selection) === JSON.stringify(prev_selection) && canvas_ref?.contains(document.activeElement)) {
      // Skip. No need to rerender.
      return;
    }

    if (selection?.type === 'text') {
      __render_text_selection();
    } else if (selection?.type === 'node') {
      __render_node_selection();
    } else if (selection?.type === 'property') {
      __render_property_selection();
    } else {
      console.log('unsupported selection', selection);
    }
  }

  function focus_toolbar() {
    // Find the first interactive element in the toolbar and focus it
    const toolbar = document.querySelector('.editor-toolbar');
    if (toolbar) {
      const firstInteractive = /** @type {HTMLElement} */ (toolbar.querySelector('input, button, select, textarea'));
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
    if (!canvas_ref?.contains(document.activeElement)) return;

    const selection = /** @type {any} */ (doc.selection);
    const is_collapsed = selection?.anchor_offset === selection?.focus_offset;

    // console.log('onkeydown', e.key);
    if (
      (e.key === 'ArrowRight' && e.altKey && e.ctrlKey && doc.selected_node) ||
      (e.key === 'ArrowRight' && e.altKey && e.ctrlKey && e.shiftKey && doc.selected_node)
    ) {
      const node = doc.selected_node;
      const layout_count = doc.config.node_layouts[node.type];

      if (layout_count > 1 && node?.layout) {
        const next_layout = (node.layout % layout_count) + 1;
        console.log('layout / count / next_layout', node.layout, layout_count, next_layout);
        const tr = doc.tr;
        tr.set([doc.selected_node?.id, 'layout'], next_layout);
        doc.apply(tr);
      }
    } else if (
      (e.key === 'ArrowLeft' && e.altKey && e.ctrlKey && doc.selected_node) ||
      (e.key === 'ArrowLeft' && e.altKey && e.ctrlKey && e.shiftKey && doc.selected_node)
    ) {
      const node = doc.selected_node;
      const layout_count = doc.config.node_layouts[node.type];
      if (layout_count > 1 && node?.layout) {
        const prev_layout = ((node.layout - 2 + layout_count) % layout_count) + 1;
        const tr = doc.tr;
        tr.set([doc.selected_node?.id, 'layout'], prev_layout);
        doc.apply(tr);
        console.log('layout / count / prev_layout', node.layout, layout_count, prev_layout);
      }
    } else if (
      (e.key === 'ArrowDown' && e.altKey && e.ctrlKey && doc.selected_node) ||
      (e.key === 'ArrowDown' && e.altKey && e.ctrlKey && e.shiftKey && doc.selected_node  )
    ) {
      const node = doc.selected_node;

      if (doc.selection.type !== 'node') {
        doc.select_parent();
      }
      const old_selection = { ...doc.selection };

      const node_array_schema = doc.inspect(doc.selection.path);
      // If we are not dealing with a node selection in a container, return
      if (node_array_schema.type !== 'node_array') return;

      const current_type_index = node_array_schema.node_types.indexOf(node.type);
      const next_type_index = (current_type_index + 1) % node_array_schema.node_types.length;
      const next_type = node_array_schema.node_types[next_type_index];
      const tr = doc.tr;
      doc.config.inserters[next_type](tr);
      tr.set_selection(old_selection);
      doc.apply(tr);
    } else if (
      (e.key === 'ArrowUp' && e.altKey && e.ctrlKey && doc.selected_node) ||
      (e.key === 'ArrowUp' && e.altKey && e.ctrlKey && e.shiftKey && doc.selected_node)
    ) {
      const node = doc.selected_node;

      if (doc.selection.type !== 'node') {
        doc.select_parent();
      }

      // if (selection.type !== 'node') return;
      const old_selection = { ...doc.selection };
      const node_array_schema = doc.inspect(doc.selection.path);
      // If we are not dealing with a node selection in a container, return
      if (node_array_schema.type !== 'node_array') return;

      const current_type_index = node_array_schema.node_types.indexOf(node.type);
      // return (current_layout_number - 1 + layout_count) % layout_count;
      const prev_type_index = (current_type_index - 1 + node_array_schema.node_types.length) % node_array_schema.node_types.length;
      const prev_type = node_array_schema.node_types[prev_type_index];
      const tr = doc.tr;
      doc.config.inserters[prev_type](tr);
      tr.set_selection(old_selection);
      doc.apply(tr);

    } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      const tr = doc.tr;
      if (select_all(tr)) {
        doc.apply(tr);
      }
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      doc.undo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      doc.redo();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && (e.altKey)) {
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
        if (doc.selection?.type === 'text' && doc.selection?.anchor_offset === 0 && doc.selection?.focus_offset === 0) {
          console.log('try to join with previous node');
          const tr = doc.tr;
          join_text_node(tr);
          doc.apply(tr);
        } else {
          // TODO: Things are not yet properly composable, I think we need to
          // realize delete_selection as a command as well.
          // See https://prosemirror.net/docs/guide/#commands for inspiration.
          // For other selections, use the normal delete behavior
          doc.apply(doc.tr.delete_selection());
        }
      }

      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'property') {
      // Focus toolbar for property selections
      focus_toolbar();
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'node') {
      const span_length = Math.abs(selection.focus_offset - selection.anchor_offset);

      if (is_collapsed) {
        // Try to insert default node if there's only one allowed ref_type
        const tr = doc.tr;
        insert_default_node(tr);
        doc.apply(tr);
        // if (insert_default_node(tr)) {
        //   doc.apply(tr);
        // } else {
        //   // Fall back to focusing toolbar when multiple types are available
        //   focus_toolbar();
        // }
      } else if (span_length === 1) {
        focus_toolbar();
      }
      // Node selections with multiple nodes do nothing on Enter
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'text') {
      const tr = doc.tr;
      break_text_node(tr);
      doc.apply(tr);
    } else if (e.key === 'Escape' && selection) {
      doc.select_parent();
      e.preventDefault();
      e.stopPropagation();
    }

  }

  /**
   * Handles composition start events for input methods like dead keys
   * This occurs when user starts typing a composed character (e.g., backtick for accents)
   * @param {CompositionEvent} event
   */
  function oncompositionstart(event) {
    if (!canvas_ref?.contains(document.activeElement)) return;
    
    is_composing = true;
  
    // Store the current selection position to handle overwriting
    // of already-inserted characters when composition starts
    const selection = doc.selection;
    
    if (selection?.type === 'text') {
      if (selection.anchor_offset !== selection.focus_offset) {
        // If there's a text selection, use the anchor position
        composition_start_offset = selection.anchor_offset;
      } else if (event.data) {
        // If there's composition data, we might need to overwrite
        // previously inserted text (e.g., dead key scenarios where a character
        // was already inserted before composition started)
        const data_length = event.data.length;
        composition_start_offset = Math.max(0, selection.anchor_offset - data_length);
      } else {
        // Normal case - start from current cursor position
        composition_start_offset = selection.anchor_offset;
      }
    } else {
      composition_start_offset = null;
    }
  }

  /**
   * Handles composition end events for input methods like dead keys
   * This occurs when composition is complete (e.g., after typing 'a' following backtick to get 'à')
   * @param {CompositionEvent} event
   */
  function oncompositionend(event) {
    if (!canvas_ref?.contains(document.activeElement)) return;
  
    event.preventDefault();
    event.stopPropagation();
  
    // Reset composition state if no data
    if (!event.data) {
      composition_start_offset = null;
      return;
    }

    const selection = doc.selection;
    
    if (selection?.type === 'text') {
      const tr = doc.tr;
      
      if (composition_start_offset !== null) {
        // Handle the case where we need to replace previously inserted text
        // This happens when a dead key inserts a character first, then composition completes
        const current_offset = selection.anchor_offset;
        
        // Ensure we have valid offsets
        if (composition_start_offset >= 0 && current_offset >= composition_start_offset) {
          // Create selection from composition start to current position to replace
          tr.set_selection({
            type: 'text',
            path: selection.path,
            anchor_offset: composition_start_offset,
            focus_offset: current_offset
          });
        }
      }
      
      // Insert the composed text (this will replace any selected text)
      tr.insert_text(event.data);
      doc.apply(tr);
    }
  
    // Always reset composition state
    composition_start_offset = null;
    is_composing = false;
  }

  /**
   * Extracts a NodeSelection from the current DOM selection.
   *
   *
   * @returns {NodeSelection | null} A NodeSelection object if the DOM selection
   *   represents a valid node selection, null otherwise
   */
  function __get_node_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    let focus_node = /** @type {HTMLElement} */ (dom_selection.focusNode);
    let anchor_node = /** @type {HTMLElement} */ (dom_selection.anchorNode);

    // If focus_node or anchor_node not an element node (e.g. a text node), we need
    // to use the parent element, so we can perform the closest() query on it.
    if (focus_node.nodeType !== Node.ELEMENT_NODE) focus_node = focus_node.parentElement;
    if (anchor_node.nodeType !== Node.ELEMENT_NODE) anchor_node = anchor_node.parentElement;

    // EDGE CASE: Let's first check if we are in a cursor trap for node cursors
    let after_node_cursor_trap = focus_node && focus_node?.closest('[data-type="after-node-cursor-trap"]');
    if (after_node_cursor_trap && focus_node === anchor_node) {
      // Find the node that this cursor trap belongs to
      let node = /** @type {HTMLElement} */ (after_node_cursor_trap.closest('[data-type="node"]'));
      if (!node) {
        console.log('No corresponding node found for after-node-cursor-trap');
        return null;
      }
      const node_path = /** @type {DocumentPath} */ (node.dataset.path.split('.'));
      const node_index = parseInt(String(node_path.at(-1)), 10);

      return {
        type: "node",
        path: node_path.slice(0, -1),
        anchor_offset: node_index + 1,
        focus_offset: node_index + 1,
      }
    }

    // EDGE CASE: Let's check if we are in a position-zero-cursor-trap for node_arrays.
    let position_zero_cursor_trap = focus_node.closest('[data-type="position-zero-cursor-trap"]');
    if (position_zero_cursor_trap && focus_node === anchor_node) {
      const node_array_el = /** @type {HTMLElement} */ (position_zero_cursor_trap.closest('[data-type="node_array"]'));
      const node_array_path = node_array_el.dataset.path.split('.');
      return {
        type: 'node',
        path: node_array_path,
        anchor_offset: 0,
        focus_offset: 0,
      }
    }

    let focus_root = /** @type {HTMLElement} */ (focus_node.closest('[data-path][data-type="node"]'));
    if (!focus_root) return null;

    let anchor_root = /** @type {HTMLElement} */ (anchor_node.closest('[data-path][data-type="node"]'));
    if (!anchor_root) return null;

    if (!(focus_root && anchor_root)) {
      return null;
    }

    let focus_root_path = focus_root.dataset.path.split('.');
    let anchor_root_path = anchor_root.dataset.path.split('.');
    let focus_node_depth = focus_root_path.length;
    let anchor_node_depth = anchor_root_path.length;

    // HACK: this works only for one level nesting - should be done recursively to work generally
    if (focus_root_path.length > anchor_root_path.length) {
      focus_root = focus_root.parentElement.closest('[data-path][data-type="node"]');
      if (!focus_root) return null;
      focus_root_path = focus_root.dataset.path.split('.');
    } else if (anchor_root_path.length > focus_root_path.length) {
      anchor_root = anchor_root.parentElement.closest('[data-path][data-type="node"]');
      if (!anchor_root) return null;
      anchor_root_path = anchor_root.dataset.path.split('.');
    }

    const is_same_node_array = focus_root_path.slice(0, -1).join('.') === anchor_root_path.slice(0, -1).join('.');
    if (!is_same_node_array) {
      console.log('invalid selection, not same node_array');
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

    // EDGE CASE: Exclude first node when anchor_node is an afer-node-cursor-trap
    // in a non-collapsed forward selection
    if (
      anchor_node.parentElement?.dataset.type === 'after-node-cursor-trap' &&
      !is_backwards &&
      anchor_offset !== focus_offset
    ) {
      anchor_offset += 1;
    }
    // EDGE CASE: Exclude first node when focus_node is an afer-node-cursor-trap
    // in a non-collapsed backward selection
    else if (
      focus_node.parentElement?.dataset.type === 'after-node-cursor-trap' &&
      is_backwards &&
      anchor_offset !== focus_offset &&
      // EDGE CASE: Only do correction when drag started from a deeper or equally deep anchor node
      anchor_node_depth >= focus_node_depth
    ) {
      focus_offset += 1;
    }

    return {
      type: 'node',
      path: anchor_root_path.slice(0, -1),
      anchor_offset: anchor_offset,
      focus_offset: focus_offset,
    };
  }

  /**
   * Extracts a PropertySelection from the current DOM selection.
   *
   *
   * @returns {PropertySelection | null} A PropertySelection object if the DOM selection
   *   represents a valid property selection, null otherwise
   */
  function __get_property_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    let focus_root = /** @type {HTMLElement} */ (dom_selection.focusNode.parentElement?.closest('[data-path][data-type="property"]'));
    if (!focus_root) return null;
    let anchor_root = /** @type {HTMLElement} */ (dom_selection.anchorNode.parentElement?.closest('[data-path][data-type="property"]'));
    if (!anchor_root) return null;

    if (focus_root === anchor_root) {
      return {
        type: 'property',
        path: focus_root.dataset.path.split('.')
      }
    }
    return null;
  }

  /**
   * Extracts a TextSelection from the current DOM selection.
   *
   *
   * @returns {TextSelection | null} A TextSelection object if the DOM selection
   *   represents a valid text selection, null otherwise
   */
  function __get_text_selection_from_dom() {
    const dom_selection = window.getSelection();
    if (dom_selection.rangeCount === 0) return null;

    const focus_node = /** @type {HTMLElement} */ (dom_selection.focusNode);
    let focus_root, anchor_root;

    if (dom_selection.focusNode === dom_selection.anchorNode && focus_node.dataset?.type === 'text') {
      // This is the case when the text node is empty (only a <br> is present)
      focus_root = anchor_root = focus_node;
    } else {
      focus_root = /** @type {HTMLElement} */ (dom_selection.focusNode.parentElement?.closest('[data-path][data-type="text"]'));
      if (!focus_root) return null;
      anchor_root = /** @type {HTMLElement} */ (dom_selection.anchorNode.parentElement?.closest('[data-path][data-type="text"]'));
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

  function __get_node_element(node_array_path, node_offset) {
    const node_array_el = canvas_ref.querySelector(`[data-path="${node_array_path}"][data-type="node_array"]`);
    if (!node_array_el) return null;

    const node_elements = node_array_el.children;
    if (node_elements.length === 0) return null;

    return node_elements[node_offset];
  }

  function __render_node_selection() {
    const selection = /** @type {NodeSelection} */ (doc.selection);
    const node_array_path = selection.path.join('.');

    let is_collapsed = selection.anchor_offset === selection.focus_offset;
    let is_backward = !is_collapsed && selection.anchor_offset > selection.focus_offset;

    // We need to translate the cusor offset to node offsets now
    let anchor_node_offset, focus_node_offset;

    if (is_collapsed) {
      anchor_node_offset = Math.max(0, selection.anchor_offset - 1);
      focus_node_offset = Math.max(0, selection.focus_offset - 1);
    } else if (is_backward) {
      anchor_node_offset = selection.anchor_offset - 1;
      focus_node_offset = selection.focus_offset;
    } else {
      anchor_node_offset = selection.anchor_offset;
      focus_node_offset = selection.focus_offset - 1;
    }

    const anchor_node = __get_node_element(node_array_path, anchor_node_offset);
    const focus_node = __get_node_element(node_array_path, focus_node_offset);

    if (!anchor_node || !focus_node) return;
    const dom_selection = window.getSelection();
    const range = window.document.createRange();

    if (is_collapsed) {
      // Cursor position in between two nodes or at the very beginning/end of a node_array
      // IMPORTANT: We need to look for direct children of anchor_node to find the right cursor trap.
      const cursor_trap_el = anchor_node.querySelector(
        selection.anchor_offset === 0 ? ':scope > .position-zero-cursor-trap' : ':scope > .after-node-cursor-trap'
      );


      range.setStart(cursor_trap_el, 1);
      range.setEnd(cursor_trap_el, 1);
      dom_selection.removeAllRanges();
      dom_selection.addRange(range);
    } else {
      // Expanded selection (one or more nodes are fully selectd)
      if (is_backward) {
        // Use the last selectable you find
        const anchor_node_selectable = [...anchor_node.querySelectorAll('.svedit-selectable')].at(-1);
        // Use the first selectable you find
        const focus_node_selectable = [...focus_node.querySelectorAll('.svedit-selectable')].at(0);

        range.setStart(focus_node_selectable, 1);
        range.setEnd(anchor_node_selectable, 1);
        dom_selection.removeAllRanges();
        dom_selection.addRange(range);
        // Phew, this was a hard nut to crack. But with that code the direction can be reversed.
        dom_selection.setBaseAndExtent(anchor_node_selectable, 1, focus_node_selectable, 1);

      } else {
        // Use the first selectable you find
        const anchor_node_selectable = [...anchor_node.querySelectorAll('.svedit-selectable')].at(0);
        // Use the last selectable you find
        const focus_node_selectable = [...focus_node.querySelectorAll('.svedit-selectable')].at(-1);

        range.setStart(anchor_node_selectable, 1);
        range.setEnd(focus_node_selectable, 1);
        dom_selection.removeAllRanges();
        dom_selection.addRange(range);
      }
    }

    // Ensure the node_array is focused
    const node_array_el = canvas_ref.querySelector(`[data-path="${node_array_path}"][data-type="node_array"]`);
    if (node_array_el) {
      node_array_el.focus();
      // Scroll the selection into view
      setTimeout(() => {
        (is_backward ? focus_node : anchor_node).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }, 0);
    } else {
      console.log('no container element found!!');
    }
  }

  function __render_property_selection() {
    const selection = doc.selection;
    // The element that holds the property
    const el = canvas_ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="property"]`);
    const cursor_trap_selectable = el.querySelector('.svedit-selectable');

    const range = window.document.createRange();
    const dom_selection = window.getSelection();

    // Select the entire cursor trap element contents and collapse to start
    range.selectNodeContents(cursor_trap_selectable);
    range.collapse(true); // Collapse to start position
    dom_selection.removeAllRanges();
    dom_selection.addRange(range);
  }

  function __render_text_selection() {
    const selection = /** @type {any} */ (doc.selection);
    // The element that holds the annotated string
    const el = canvas_ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="text"]`);
    const empty_text = doc.get(selection.path)[0].length === 0;

    const range = window.document.createRange();
    const dom_selection = window.getSelection();
    let current_offset = 0;
    /** @type {HTMLElement | Text} */
    let anchor_node;
    /** @type {HTMLElement | Text} */
    let focus_node;
    /** @type {number} */
    let anchor_node_offset
    /** @type {number} */
    let focus_node_offset;
    const is_backward = selection.anchor_offset > selection.focus_offset;
    const start_offset = Math.min(selection.anchor_offset, selection.focus_offset);
    const end_offset = Math.max(selection.anchor_offset, selection.focus_offset);


    // Helper function to process each node
    function process_node(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const node_length = node.length;

        if (is_backward) {
          if (!focus_node && current_offset + node_length >= start_offset) {
            focus_node = node;
            focus_node_offset = start_offset - current_offset;
          }
        } else {
          if (!anchor_node && current_offset + node_length >= start_offset) {
            anchor_node = node;
            anchor_node_offset = start_offset - current_offset;
          }
        }

        // Find end node
        if (is_backward) {
          if (!anchor_node && current_offset + node_length >= end_offset) {
            anchor_node = node;
            anchor_node_offset = end_offset - current_offset;
            return true; // Stop iteration
          }
        } else {
          if (!focus_node && current_offset + node_length >= end_offset) {
            focus_node = node;
            focus_node_offset = end_offset - current_offset;
            return true; // Stop iteration
          }
        }

        current_offset += node_length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child_node of node.childNodes) {
          if (process_node(child_node)) return true; // Stop iteration if end found
        }
      }
      return false; // Continue iteration
    }

    // EDGE CASE: When text is empty, we need to set a different DOM selection
    if (start_offset === end_offset && start_offset === 0 && empty_text) {
      // Markup for empty text looks like this `<div data-type="text"><br></div>`.
      // And the correct cursor position is after the <br> element.
      anchor_node = el;
      anchor_node_offset = 1;
      focus_node = el;
      focus_node_offset = 1;
    } else {
      // DEFAULT CASE
      for (const child_node of el.childNodes) {
        if (process_node(child_node)) break;
      }

      // EDGE CASE: cursor at the end of an annotation
      // TODO: It seems this edge case is handled elsewhere. We keep around the checker for a
      // while and delete this branch, if we don't see any problems.
      if (anchor_node && !focus_node && current_offset === end_offset) {
        alert('EDGE CASE: cursor at the end of an annotation.');
        // console.log('EDGE CASE: cursor at the end of an annotation');
        // focus_node = /** @type {HTMLElement | Text} */ (anchor_node.nextSibling || anchor_node);
        // focus_node_offset = focus_node === anchor_node ? anchor_node.length : 0;
      }
    }

    // Set the range if both start and end were found
    if (anchor_node && focus_node) {
      // Always set range in document order (start to end)
      if (is_backward) {
        range.setStart(focus_node, focus_node_offset);
        range.setEnd(anchor_node, anchor_node_offset);
      } else {
        range.setStart(anchor_node, anchor_node_offset);
        range.setEnd(focus_node, focus_node_offset);
      }

      dom_selection.removeAllRanges();
      if (is_backward) {
        // For backward selections, collapse to end and extend to start
        range.collapse(false); // collapse to end
        dom_selection.addRange(range);
        dom_selection.extend(focus_node, focus_node_offset);
      } else {
        dom_selection.addRange(range);
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
    class:hide-selection={doc.selection?.type === 'node'}
    bind:this={canvas_ref}
    {onbeforeinput}
    {oncompositionstart}
    {oncompositionend}
    contenteditable={editable ? 'true' : 'false'}
  >
    <RootComponent {path} />
  </div>
  <Overlays />
</div>

<style>
  .svedit-canvas {
    --layout-orientation: vertical;
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

	@media not (pointer: coarse) {
    .svedit-canvas.hide-selection :global(::selection) {
      background: transparent;
    }
  }
</style>
