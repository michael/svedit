<script>
  import { setContext } from 'svelte';
  import { snake_to_pascal, get_char_length, utf16_to_char_offset, char_to_utf16_offset, get_char_at, char_slice } from './util.js';
  import { break_text_node, insert_default_node, select_all } from './commands.svelte.js';

  /** @import {
   *   SveditProps,
   *   DocumentPath,
   *   Selection,
   *   TextSelection,
   *   NodeSelection,
   *   PropertySelection,
   *   NodeId
   * } from './types.d.ts';
   */

  /** @type {SveditProps} */
  let {
    doc,
    editable = $bindable(false),
    path,
    class: css_class,
    autocapitalize = "on",
    spellcheck = "true",
  } = $props();

  let canvas_ref;
  let root_node = $derived(doc.get(path));
  let Overlays = $derived(doc.config.system_components.Overlays);
  let RootComponent = $derived(doc.config.node_components[snake_to_pascal(root_node.type)]);

  // Track temporary disabled onkeydown events (e.g. during character composition)
  let skip_onkeydown = false;
  let is_composing = $state(false);
  let input_selection = undefined;

  // Detect Chrome on desktop (not mobile) - only available in browser
  let is_chrome_desktop = $state(false);

  /**
   * Detect if the current browser is on a mobile device
   * @returns {boolean} true if mobile browser, false otherwise
   */
  function is_mobile_browser() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    const user_agent = navigator.userAgent;
    return /iPhone|iPad|iPod|Android|Mobile/i.test(user_agent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
  }

  $effect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const user_agent = navigator.userAgent;
      const is_chrome = user_agent.includes('Chrome') && !user_agent.includes('Edg');
      const is_mobile = is_mobile_browser();
      is_chrome_desktop = is_chrome && !is_mobile;
    }
  });

  /** Expose function so parent can call it */
  export { focus_canvas };

  setContext("svedit", {
    get doc() {
      return doc;
    },
    get editable() {
      return editable;
    },
    get is_composing() {
      return is_composing
    },
  });

  function diff_text(old_text, new_text) {
    const old_length = get_char_length(old_text);
    const new_length = get_char_length(new_text);

    let start = 0;
    while (
      start < old_length &&
      start < new_length &&
      get_char_at(old_text, start) === get_char_at(new_text, start)
    ) {
      start++;
    }

    let old_end = old_length;
    let new_end = new_length;
    while (
      old_end > start &&
      new_end > start &&
      get_char_at(old_text, old_end - 1) === get_char_at(new_text, new_end - 1)
    ) {
      old_end--;
      new_end--;
    }

    return {
      start_offset: start,
      end_offset: old_end,
      replacement_text: char_slice(new_text, start, new_end)
    };
  }

  function commit_input() {
    if (input_selection?.type !== 'text') return;
    const model_text = doc.get(input_selection.path).text;
    const dom_text_element = document.querySelector(`[data-path="${input_selection.path.join('.')}"]`);
    const dom_text = dom_text_element.textContent;
    const op = diff_text(model_text, dom_text);
    // console.log('======== COMMIT INPUT ========')
    // console.log('mdl_text:', model_text);
    // console.log('dom_text:', dom_text);
    // console.log('op', op);

    // NOTE: We are currently in an out-of-sync DOM state, right after
    // contenteditable applied the input. But we can use this state
    // to determine the ideal intended selection after the operation.
    // Because our diffing may miss some context. E.g. when you replace "mchael"
    // to "Michael" it will replace "m" with "Mi" and put the cursor after the "i",
    // but we actually want it after "Michael".
    const before_selection = __get_text_selection_from_dom();

    // Now we are applying the change to the document
    const tr = doc.tr;
    tr.set_selection({
      type: 'text',
      path: [...input_selection.path],
      anchor_offset: op.start_offset,
      focus_offset: op.end_offset,
    });
    tr.insert_text(op.replacement_text);
    tr.set_selection(before_selection);
    doc.apply(tr);
    // console.log('applied op', op);

    // After each commited replacement, we start accepting custom key handlers again.
    skip_onkeydown = false;
    is_composing = false;
    input_selection = null;
  }

  function oninput(event) {
    // console.log(`oninput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);
    if (
      // canvas_ref?.contains(document.activeElement) &&
      // doc.selection?.type === 'text' &&
      input_selection.type === 'text' &&
      !event.isComposing
    ) {
      commit_input();
    }
  }

  /**
   * @param {InputEvent} event
   */
  function onbeforeinput(event) {
    // console.log(`onbeforeinput: ${event.inputType}, data: "${event.data}", isComposing: ${event.isComposing}`, event);

    // Only take input when in a valid text selection inside the canvas
    if (
      !(canvas_ref?.contains(document.activeElement))
    ) {
      event.preventDefault();
      return;
    }

    if (event.inputType === 'formatBold' && doc.selection?.type === 'text') {
      doc.apply(doc.tr.annotate_text('strong'));
      event.preventDefault();
      event.stopPropagation();
    }

    if (event.inputType === 'formatItalic' && doc.selection?.type === 'text') {
      doc.apply(doc.tr.annotate_text('emphasis'));
      event.preventDefault();
      event.stopPropagation();
    }

    // NOTE: underline doesn't make much sense as a semantic annotation,
    // so we rewire `cmd + u` to toggle highlights
    if (event.inputType === 'formatUnderline' && doc.selection?.type === 'text') {
      doc.apply(doc.tr.annotate_text('highlight'));
      event.preventDefault();
      event.stopPropagation();
    }

    if (event.inputType === 'deleteContentBackward') {
      doc.apply(doc.tr.delete_selection('backward'));
      event.preventDefault();
      event.stopPropagation();
    }

    if (event.inputType === 'deleteContentForward') {
      doc.apply(doc.tr.delete_selection('forward'));
      event.preventDefault();
      event.stopPropagation();
    }

    // We remember the "input selection", because in some mobile browsers (Samsung Android) the onbeforeinput event
    // is fired on a different selection than the input event.
    input_selection = { ...doc.selection };

    // If replacement is detected, I let contenteditable do the thing and wait for
    // the oninput event to do the diffing and update the model.
    if (event.inputType === 'insertReplacementText') {
      return;
    }

    // For now I reject drag+drop text movements.
    // TODO: If I want to support those, I need to handle them in such a way that
    // you can drag from one text property to another too.
    if (event.inputType === 'deleteByDrag' || event.inputType === 'insertFromDrop') {
      event.preventDefault();
      return;
    }

    // While composing, I do nothing and let the oncompositionend
    // event handle the final replacement by recovering it from the DOM.
    if (event.isComposing) {
      return;
    }

    // Insert the character, unless there is none.
    let inserted_text = event.data;

    // Sometimes (e.g. for replacements) the inserted_text is available via
    // event.dataTransfer, not event.data
    if (!inserted_text && event.dataTransfer) {
      inserted_text = event.dataTransfer?.getData('text/plain');
    }

    // If there's no inserted_text, I'm not handling this.
    if (!inserted_text) {
      event.preventDefault();
      return;
    }

    // For now I don't accept structural replacements for savety reasons.
    // E.g. this will catch Apple's writing tools that will attempt to mess with our DOM.
    if (inserted_text.includes('\n') || inserted_text.includes('\t')) {
      event.preventDefault();
      return;
    }

    function get_base_char(char) {
      if (!char) return undefined;
      const normalized = char.normalize('NFD');
      // If normalization doesn't change it OR it's longer than 2 chars, it's probably not a simple diacritic
      if (normalized.length <= 2 && normalized !== char) {
        return normalized[0];
      }
      return undefined;
    }

    if (
      (get_char_length(inserted_text) > 1) ||
      (get_char_length(inserted_text) === 1 && get_base_char(inserted_text))
    ) {
      skip_onkeydown = true;
      return; // we are dealing with a replacement
    }

    const tr = doc.tr;
    tr.insert_text(inserted_text);
    doc.apply(tr, { batch: true });
    input_selection = undefined;
    event.preventDefault();
  }

  // Map DOM selection to internal model
  function onselectionchange() {
    if (!editable) return;
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
   * Creates HTML clipboard format with embedded svedit data
   * @param {Object} json_data - The svedit data to embed
   * @param {string} fallback_html - HTML for cross-app compatibility
   * @returns {string} HTML with embedded svedit data
   */
  function create_svedit_html_format(json_data, fallback_html) {
    // Use encodeURIComponent to handle Unicode, then base64 encode
    const json_string = JSON.stringify(json_data);
    const encoded_data = btoa(encodeURIComponent(json_string));

    return `<meta charset="utf-8">
<div>
  <span data-svedit="${encoded_data}"></span>
</div>
${fallback_html}`;
  }

  /**
   * Extracts svedit data from HTML clipboard format
   * @param {string} html - HTML content from clipboard
   * @returns {Object|null} Parsed svedit data or null if not found
   */
  function extract_svedit_data_from_html(html) {
    const svedit_regex = /data-svedit="([^"]+)"/;
    const match = html.match(svedit_regex);

    if (match && match[1]) {
      try {
        // Decode base64, then decode URI component to handle Unicode
        const base64_decoded = atob(match[1]);
        const decoded_data = decodeURIComponent(base64_decoded);
        return JSON.parse(decoded_data);
      } catch (e) {
        console.warn('Failed to decode svedit data from HTML:', e);
        return null;
      }
    }

    return null;
  }

  /**
   * Default node exporter for nodes without specific exporters
   * @param {Object} node - Node object
   * @returns {string} HTML representation
   */
  function default_node_html_exporter(node, doc, html_exporters) {
    let html = '';
    const node_schema = doc.schema[node.type];

    for (const [prop_name, prop_value] of Object.entries(node)) {
      if (prop_name === 'id' || prop_name === 'type') continue;
      const property_definition = node_schema.properties[prop_name];
      // Check if this is an annotated_text property (object with text property)
      if (property_definition.type === 'annotated_text') {
        const text_content = prop_value.text;
        if (text_content.trim()) {
          html += `<p>${text_content.trim()}</p>\n`;
        }
      } else if (property_definition.type === 'node_array') {
        for (const child_id of prop_value) {
          const child = doc.get(child_id);
          const child_exporter = html_exporters[child.type] || default_node_html_exporter;
          html += child_exporter(child, doc, html_exporters);
        }
      }
    }

    return html;
  }

  function default_node_plain_text_exporter(node) {
    let plain_text = '';

    for (const [prop_name, prop_value] of Object.entries(node)) {
      if (prop_name === 'id' || prop_name === 'type') continue;

      // Check if this is an annotated_text property (object with text property)
      if (typeof prop_value === 'object' && prop_value !== null && typeof prop_value.text === 'string') {
        const text_content = prop_value.text;
        if (text_content.trim()) {
          plain_text += `${text_content.trim()}\n\n`;
        }
      }
    }

    return plain_text;
  }

  /**
   * Exports nodes to HTML using document config exporters
   * @param {Object[]} nodes - Array of node objects
   * @returns {string} HTML representation
   */
  function export_html(nodes) {
    let html = '';

    for (const node of nodes) {
      const html_exporters = doc.config.html_exporters || {};

      if (html_exporters[node.type]) {
        // Use custom exporter for this node type
        html += html_exporters[node.type](node, doc, html_exporters);
      } else {
        // Use default exporter
        html += default_node_html_exporter(node, doc, html_exporters);
      }
    }
    return html;
  }

  function export_plain_text(nodes) {
    let plain_text = '';

    for (const node of nodes) {
      plain_text += default_node_plain_text_exporter(node);
    }
    return plain_text.trim();
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

    let plain_text, annotated_text, html;

    if (doc.selection?.type === 'text') {
      plain_text = doc.get_selected_plain_text();
      annotated_text = doc.get_selected_annotated_text();
      const fallback_html = `<span>${annotated_text.text}</span>`;

      console.log('Text copy:', {
        annotated_text,
        plain_text,
        html,
      });

      html = create_svedit_html_format(annotated_text, fallback_html);
    } else if (doc.selection?.type === 'node') {
      const selected_nodes = doc.get_selected_nodes();
      const { nodes, main_nodes } = prepare_copy_payload(selected_nodes);

      const json_data = { nodes, main_nodes };

      console.log('Node copy:', {
        selected_nodes,
        nodes,
        total_nodes: Object.keys(nodes).length,
        operation: delete_selection ? 'cut' : 'copy'
      });

      // Generate fallback HTML for cross-app compatibility
      const selected_node_objects = main_nodes.map(id => nodes[id]);
      const fallback_html = export_html(selected_node_objects);

      // Create HTML with embedded svedit data
      html = create_svedit_html_format(json_data, fallback_html);
      // Generate plain text representation
      plain_text = export_plain_text(selected_node_objects);
    } else if (doc.selection?.type === 'property') {
      const property_definition = doc.inspect(doc.selection.path);
      const value = doc.get(doc.selection.path);
      const json_data = {
        kind: 'property',
        name: property_definition.name,
        type: property_definition.type,
        value,
      };
      console.log('Property copy:', json_data);
      html = create_svedit_html_format(json_data, `<span>${value}</span>`);
      plain_text = String(value);
    }

    // Write to clipboard using event.clipboardData
    try {
      event.clipboardData?.setData('text/plain', plain_text || '');
      event.clipboardData?.setData('text/html', html || '');
      console.log('Data copied to clipboard successfully');
    } catch (err) {
      console.error('Failed to copy data: ', err);
    }

    if (delete_selection) {
      doc.apply(doc.tr.delete_selection());
    }
  }

  function oncut(event) {
    oncopy(event, true);
  }


  /**
   * Attempts to paste JSON data as a node at the current selection.
   *
   * @param {string|object} pasted_json - The JSON data to paste, either as a string or parsed object
   * @param {Selection} [selection] - Optional selection (node cursor) where the payload should be pasted
   * @returns {boolean} True if the paste operation was successful, false otherwise
   */
  function try_node_paste(pasted_json, selection) {
    const { nodes, main_nodes } = pasted_json;

    // NOTE: At this point, nodes contains a subgraph from the copy
    // with original ids.
    let tr = doc.tr;
    if (selection) {
     tr.set_selection(selection);
    }

    // We can safely assume we're dealing with a node_array property
    const property_definition = doc.inspect(tr.selection.path);
    const first_compatible_text_node_type = property_definition.node_types.find(type => doc.kind({ type }) === 'text');

    const nodes_to_insert = [];
    let rejected = false;
    for (const node_id of main_nodes) {
      const node = nodes[node_id];
      if (!property_definition.node_types.includes(node.type)) {
        // Incompatible node type detected
        if (doc.kind(node) === 'text' && first_compatible_text_node_type) {
          const new_node_id = tr.build('the_node', {
            the_node: {
              id: 'the_node',
              type: first_compatible_text_node_type,
              content: node.content,
            },
          });
          nodes_to_insert.push(new_node_id);
        } else {
          console.log(`rejected ${node.type}. Only ${property_definition.node_types.join(', ')} allowed.`);
          rejected = true;
          break;
        }
      } else {
        const new_node_id = tr.build(node_id, nodes);
        nodes_to_insert.push(new_node_id);
      }
    }

    if (!rejected) {
      tr.insert_nodes(nodes_to_insert);
      doc.apply(tr);
      return true;
    } else {
      if (tr.selection.path.length >= 2) {
        const next_node_insert_cursor = doc.get_next_node_insert_cursor(tr.selection);
        if (next_node_insert_cursor) {
          try_node_paste(pasted_json, next_node_insert_cursor);
        }
      }
    }
    return false;
  }

  async function onpaste(event) {
    // Only handle paste events if focus is within the canvas
    if (!canvas_ref?.contains(document.activeElement)) return;
    event.preventDefault();

    let plain_text, pasted_json, pasted_images = [];

    // NOTE: For some reason, await navigator.clipboard.read()
    const clipboard_items =  event.clipboardData?.items || [];
    for (const item of clipboard_items || []) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        const data_url = URL.createObjectURL(blob);
        pasted_images.push({
          blob,
          data_url,
          type: item.type,
          size: blob.size
        });
      }
    }

    if (pasted_images.length > 0) {
      pasted_json = await doc.config.handle_image_paste(doc, pasted_images);
      console.log('pasted_json_after_image_paste', pasted_json);
      // NOTE: If no pasted_json is returned from the custom handler, we assume that content creation has been
      // handled inside handle_image_paste already.
      if (!pasted_json) return;
    } else {
      // First try to extract svedit data from HTML format
      try {
        const html_content = event.clipboardData?.getData('text/html');
        if (html_content) {
          pasted_json = extract_svedit_data_from_html(html_content);
        }
      } catch (e) {
        console.log('No HTML format available or failed to extract svedit data:', e);
        pasted_json = undefined;
      }

      try {
        plain_text = event.clipboardData?.getData('text/plain');
      } catch (e) {
        console.error('Failed to paste any content:', e);
      }

      // Try to contruct a node payload from plain text when applicable
      if (!pasted_json && typeof plain_text === 'string') {
        const plain_text_fragments = plain_text.split('\n\n').map(fragment => fragment.trim()).filter(Boolean);
        if (plain_text_fragments.length > 1) {
          pasted_json = {
            main_nodes: [],
            nodes: [],
          };
          for (let i = 0; i < plain_text_fragments.length; i++) {
            const fragment = plain_text_fragments[i];
            pasted_json.nodes["fragment_" + i] = {
              id: "fragment_" + i,
              type: 'text',
              content: {
                text: fragment,
                annotations: []
              }
            };
            pasted_json.main_nodes.push("fragment_" + i);
          }
        }
      }
    }

    console.log('plain_text', plain_text);
    console.log('pasted_json', pasted_json);

    if (pasted_json?.main_nodes && doc.selection?.type === 'node') {
      // Paste nodes at a node selection
      try_node_paste(pasted_json);
    } else if (pasted_json?.kind === 'property' && doc.selection?.type === 'property') {
      const property_definition = doc.inspect(doc.selection.path);
      if (property_definition.type === pasted_json.type) {
        doc.apply(doc.tr.set(doc.selection.path, pasted_json.value));
      }
    } else if (doc.selection?.type === 'text' && pasted_json?.text) {
      // Paste text at a text selection
      doc.apply(doc.tr.insert_text(pasted_json.text, pasted_json.annotations, pasted_json.nodes));
    } else if (doc.selection?.type === 'text' && pasted_json?.main_nodes?.length === 1 && doc.kind(pasted_json?.nodes[pasted_json.main_nodes[0]]) === 'text') {
      // Paste a single text node, at a text cursor
      const text_property = pasted_json.nodes[pasted_json.main_nodes[0]].content;
      doc.apply(doc.tr.insert_text(text_property.text, text_property.annotations, pasted_json.nodes));
    } else if (['text', 'property'].includes(doc.selection?.type) && pasted_json?.nodes) {
      // Paste nodes at a text or property selection by finding the next valid insert cursor
      const next_node_insert_cursor = doc.get_next_node_insert_cursor(doc.selection);
      try_node_paste(pasted_json, next_node_insert_cursor);
    } else if (typeof plain_text === 'string') {
      // External paste: Fallback to plain text when no svedit data is found
      doc.apply(doc.tr.insert_text(plain_text.trim()));
    } else {
      console.log('Could not paste.');
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
      console.log('unsupported selection', $state.snapshot(selection));
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
    // Turn editable on
    if (e.key === 'e' && (e.ctrlKey || e.metaKey)) {
      editable = true;
      return;
    }

    // Turn editable off (=save)
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      doc.selection = null;
      editable = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Only handle keyboard events if focus is within the canvas
    if (!canvas_ref?.contains(document.activeElement)) return;

    // Key handling temporarily disabled (e.g. while character composition takes place)
    if (skip_onkeydown) {
      // console.log('onkeydown skipped');
      // Currently we do nothing, but we could handle keydown during character composition here.
      return;
    }

    const selection = /** @type {any} */ (doc.selection);
    const is_collapsed = selection?.anchor_offset === selection?.focus_offset;

    if (
      (e.key === 'ArrowRight' && e.altKey && e.ctrlKey && doc.layout_node) ||
      (e.key === 'ArrowRight' && e.altKey && e.ctrlKey && e.shiftKey && doc.layout_node)
    ) {
      const node = doc.layout_node;
      const layout_count = doc.config.node_layouts[node.type];

      if (layout_count > 1 && node?.layout) {
        const next_layout = (node.layout % layout_count) + 1;
        console.log('layout / count / next_layout', node.layout, layout_count, next_layout);
        const tr = doc.tr;
        tr.set([doc.layout_node?.id, 'layout'], next_layout);
        doc.apply(tr);
      }
      e.preventDefault();
    } else if (
      (e.key === 'ArrowLeft' && e.altKey && e.ctrlKey && doc.layout_node) ||
      (e.key === 'ArrowLeft' && e.altKey && e.ctrlKey && e.shiftKey && doc.layout_node)
    ) {
      const node = doc.layout_node;
      const layout_count = doc.config.node_layouts[node.type];

      if (layout_count > 1 && node?.layout) {
        const prev_layout = ((node.layout - 2 + layout_count) % layout_count) + 1;
        const tr = doc.tr;
        tr.set([doc.layout_node?.id, 'layout'], prev_layout);
        doc.apply(tr);
        console.log('layout / count / prev_layout', node.layout, layout_count, prev_layout);
      }
      e.preventDefault();
    } else if (
      (e.key === 'ArrowDown' && e.altKey && e.ctrlKey) ||
      (e.key === 'ArrowDown' && e.altKey && e.ctrlKey && e.shiftKey  )
    ) {
      if (doc.selection.type !== 'node') {
        doc.select_parent();
      }
      const node = doc.selected_node;
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
      e.preventDefault();
    } else if (
      (e.key === 'ArrowUp' && e.altKey && e.ctrlKey) ||
      (e.key === 'ArrowUp' && e.altKey && e.ctrlKey && e.shiftKey)
    ) {
      if (doc.selection.type !== 'node') {
        doc.select_parent();
      }
      const node = doc.selected_node;
      const old_selection = { ...doc.selection };
      const node_array_schema = doc.inspect(doc.selection.path);
      // If we are not dealing with a node selection in a container, return
      if (node_array_schema.type !== 'node_array') return;
      const current_type_index = node_array_schema.node_types.indexOf(node.type);
      const prev_type_index = (current_type_index - 1 + node_array_schema.node_types.length) % node_array_schema.node_types.length;
      const prev_type = node_array_schema.node_types[prev_type_index];
      const tr = doc.tr;
      doc.config.inserters[prev_type](tr);
      tr.set_selection(old_selection);
      doc.apply(tr);
      e.preventDefault();
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
    } else if (e.key === 'Enter' && (e.shiftKey) && !is_mobile_browser() && selection?.type === 'text' && doc.inspect(selection.path).allow_newlines) {
      doc.apply(doc.tr.insert_text('\n'));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'b' && (e.ctrlKey || e.metaKey) && selection?.type === 'text') {
      doc.apply(doc.tr.annotate_text('strong'));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'i' && (e.ctrlKey || e.metaKey) && selection?.type === 'text') {
      doc.apply(doc.tr.annotate_text('emphasis'));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'u' && (e.ctrlKey || e.metaKey) && selection?.type === 'text') {
      doc.apply(doc.tr.annotate_text('highlight'));
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      const has_link = doc.active_annotation('link');
      if (has_link) {
        // Delete link
        doc.apply(doc.tr.annotate_text('link'));
      } else {
        // Create link
        const href = window.prompt('Enter the URL', 'https://example.com');
        if (href) {
          doc.apply(doc.tr.annotate_text('link', { href }));
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
        // Always insert default node on ENTER
        const tr = doc.tr;
        insert_default_node(tr);
        doc.apply(tr);
      } else if (span_length === 1) {
        focus_toolbar();
      }
      // Node selections with multiple nodes do nothing on Enter
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === 'Enter' && selection?.type === 'text') {
      const tr = doc.tr;
      if (break_text_node(tr)) {
        doc.apply(tr);
      }
      e.preventDefault();
      e.stopPropagation();
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
    if (doc.selection.type !== 'text') return;
    console.log('DEBUG: oncompositionstart', event.data);
    // Disable keydown event handling during composition. This way, you can confirm
    // a diacritic (a->ä) with ENTER without causing a line break.
    skip_onkeydown = true;
    is_composing = true;
    return;
  }

  /**
   * Handles composition end events for input methods like dead keys
   * This occurs when composition is complete (e.g., after typing 'a' following backtick to get 'à')
   */
  function oncompositionend(/*event*/) {
    // console.log('DEBUG: oncompositionend, insert:', event.data);
    if (!canvas_ref?.contains(document.activeElement)) return;
    if (canvas_ref?.contains(document.activeElement) && doc.selection?.type === 'text') {
      commit_input();
    }
    return;
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
      // EDGE CASE 1: Either text node is empty (only a <br> is present), or cursor is after a <br> at the very end of the text node
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

    // EDGE CASE 1B: Cursor after trailing <br> at end of text
    //
    // When text ends with a newline (\n), the browser renders it as a <br> element.
    // If the user places their cursor after this <br>, the selection detection
    // incorrectly reports position 0 instead of the actual text length.
    //
    // Example DOM structure when text is "Hello\n":
    // <div data-type="text">
    //   #text "Hello"    ← index 0
    //   <br>             ← index 1 (represents the \n)
    // </div>
    //
    // When cursor is after the <br>, we get:
    // - focusNode: the div element
    // - focusOffset: 2 (after the 2nd child)
    // - But normal processing returns position 0 instead of text.length
    //
    // This edge case detects when:
    // 1. Text content ends with \n
    // 2. Last child node is a <br> (the visual representation of that \n)
    // 3. Cursor is positioned at or near the end
    // And returns the correct text.length position instead.
    const text_content = doc.get(path).text;
    const text_length = get_char_length(text_content);
    if (text_length > 0) {
      const last_char = get_char_at(text_content, text_length - 1);
      if (dom_selection.focusNode === dom_selection.anchorNode &&
          dom_selection.focusNode === focus_node &&
          focus_node.dataset?.type === 'text' &&
          !focus_node.classList.contains('empty') &&
          last_char === '\n') {

        const child_nodes = focus_node.childNodes;

        // Check if the last child is a BR (indicating text ends with newline)
        // and cursor is positioned near the end (after any of the last few elements)
        if (child_nodes.length > 0 &&
            child_nodes[child_nodes.length - 1].nodeName === 'BR' &&
            dom_selection.focusOffset >= child_nodes.length - 2) {
          return {
            type: 'text',
            path,
            anchor_offset: text_length,
            focus_offset: text_length
          };
        }
      }
    }

    let anchor_offset = 0;
    let focus_offset = 0;
    let current_offset = 0;

    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent;
        const nodeCharLength = get_char_length(nodeText);
        if (node === range.startContainer) {
          // Convert UTF-16 offset to character offset
          const char_start_offset = utf16_to_char_offset(nodeText, range.startOffset);
          anchor_offset = current_offset + char_start_offset;
        }
        if (node === range.endContainer) {
          // Convert UTF-16 offset to character offset
          const char_end_offset = utf16_to_char_offset(nodeText, range.endOffset);
          focus_offset = current_offset + char_end_offset;
        }
        current_offset += nodeCharLength;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const childNode of node.childNodes) {
          processNode(childNode);
        }
      }
      return (focus_offset !== 0);
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
      [anchor_offset, focus_offset] = [focus_offset, anchor_offset];
    }

    return {
      type: 'text',
      path,
      anchor_offset: anchor_offset,
      focus_offset: focus_offset
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
      console.log('No container element found!');
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

    // Scroll the selection into view
    setTimeout(() => {
      const selectedElement = dom_selection.focusNode.parentElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }, 0);
  }

  function __render_text_selection() {
    const selection = /** @type {any} */ (doc.selection);
    // The element that holds the annotated string
    const el = canvas_ref.querySelector(`[data-path="${selection.path.join('.')}"][data-type="text"]`);
    const empty_text = doc.get(selection.path).text.length === 0;

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
        const node_text = node.textContent;
        const node_char_length = get_char_length(node_text);

        if (is_backward) {
          if (!focus_node && current_offset + node_char_length >= start_offset) {
            focus_node = node;
            const char_offset = start_offset - current_offset;
            focus_node_offset = char_to_utf16_offset(node_text, char_offset);
          }
        } else {
          if (!anchor_node && current_offset + node_char_length >= start_offset) {
            anchor_node = node;
            const char_offset = start_offset - current_offset;
            anchor_node_offset = char_to_utf16_offset(node_text, char_offset);
          }
        }

        // Find end node
        if (is_backward) {
          if (!anchor_node && current_offset + node_char_length >= end_offset) {
            anchor_node = node;
            const char_offset = end_offset - current_offset;
            anchor_node_offset = char_to_utf16_offset(node_text, char_offset);
            return true; // Stop iteration
          }
        } else {
          if (!focus_node && current_offset + node_char_length >= end_offset) {
            focus_node = node;
            const char_offset = end_offset - current_offset;
            focus_node_offset = char_to_utf16_offset(node_text, char_offset);
            return true; // Stop iteration
          }
        }
        current_offset += node_char_length;
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
    class:node-cursor={doc.selection?.type === 'node' && doc.selection.anchor_offset === doc.selection.focus_offset}
    class:property-selection={doc.selection?.type === 'property'}
    bind:this={canvas_ref}
    {oninput}
    {onbeforeinput}
    {oncompositionstart}
    {oncompositionend}
    contenteditable={editable ? 'true' : 'false'}
    {autocapitalize}
    {spellcheck}
    {...{
      // NOTE: Autocomplete and autocorrect make immense troubles
      // on Desktop Chrome, so we disable them only for Chrome desktop.
      // Additionally, OSX-native auto-complete also breaks, because
      // I'm using a keyed block that always wipes the DOM of a text node
      // on every change.
      autocomplete: is_chrome_desktop ? "off" : "on",
      autocorrect: is_chrome_desktop ? "off" : "on"
    }}
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

	.svedit-canvas :global(::selection) {
		background: var(--editing-fill-color);
	}

	@media not (pointer: coarse) {
	  .svedit-canvas.hide-selection {
      caret-color: transparent;
    }
  }

  /* When the cursor is in a cursor-trap we never want to see the caret */
  .svedit-canvas.node-cursor, .svedit-canvas.property-selection {
    caret-color: transparent;
  }

  @media not (pointer: coarse) {
	  @supports (anchor-name: --test) {
      .svedit-canvas.hide-selection :global(::selection) {
         background: transparent;
      }
		}
  }
</style>
