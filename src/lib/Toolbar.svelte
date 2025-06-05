<script>
  import { fly } from 'svelte/transition';
  import Icon from './Icon.svelte';

  let {
    doc,
  } = $props();

  const layout_options = [
    { value: 1, label: 'Image left', icon: 'image-left' },
    { value: 2, label: 'Image right', icon: 'image-right' },
    { value: 3, label: 'Image top', icon: 'image-at-top' },
  ];

  const list_style_options = [
    { value: 'square', label: 'Square', icon: 'square' },
    { value: 'disc', label: 'Disc', icon: 'disc' },
    { value: 'decimal-leading-zero', label: 'Decimal leading zero', icon: 'list-decimal-leading-zero' },
    // { value: 'decimal', label: 'Decimal', icon: 'list-decimal' },
    { value: 'lower-latin', label: 'Lower latin', icon: 'list-lower-latin' },
    // { value: 'lower-roman', label: 'Lower roman', icon: 'list-lower-roman' },
    // { value: 'upper-latin', label: 'Upper latin', icon: 'list-upper-latin' },
    { value: 'upper-roman', label: 'Upper roman', icon: 'list-upper-roman' },
  ];

  function handle_layout_change(layout_index) {
    if (!doc.selection || doc.selection.type !== 'container') return;
    
    const start = Math.min(doc.selection.anchor_offset, doc.selection.focus_offset);
    const container = doc.get(doc.selection.path);
    const block_id = container[start];
    
    if (block_id) {
      const tr = doc.tr;
      tr.set([block_id, 'layout'], layout_index);
      doc.apply(tr);
    }
  }

  function handle_list_style_change(list_style) {
    if (!doc.selection || doc.selection.type !== 'container') return;
    
    const start = Math.min(doc.selection.anchor_offset, doc.selection.focus_offset);
    const container = doc.get(doc.selection.path);
    const block_id = container[start];
    
    if (block_id) {
      const tr = doc.tr;
      tr.set([block_id, 'list_style'], list_style);
      doc.apply(tr);
    }
  }

  function insert_link() {
    // if the user cancels the prompt it will use the previous link
    const current_link = doc.active_annotation()?.[2] === 'link' 
      ? doc.active_annotation()[3].href 
      : '';
    
    const new_url = window.prompt('Enter the URL', current_link);

    // Update if the user didn't cancel the prompt
    if (new_url !== null) {
      const tr = doc.tr;
      tr.annotate_text('link', {
        href: new_url // Pass the new_url directly, even if it's an empty string
      });
      doc.apply(tr);
    }
  }

  // Helper function to get the currently selected block
  function get_selected_block() {
    if (!doc.selection || doc.selection.type !== 'container') return null;
    
    const start = Math.min(doc.selection.anchor_offset, doc.selection.focus_offset);
    const container = doc.get(doc.selection.path);
    const block_id = container[start];
    
    return block_id ? doc.get(block_id) : null;
  }

  // Reactive variable for selected block
  let selected_block = $derived(get_selected_block());

  // Check if we should show the image URL input
  let show_image_input = $derived(
    doc.selection?.type === 'property' && 
    doc.selection.path.at(-1) === 'image' &&
    doc.get(doc.selection.path.slice(0, -1))?.type === 'story'
  );

  // Get current image URL value
  let current_image_url = $derived(
    show_image_input ? doc.get(doc.selection.path) : ''
  );

  function update_image_url(event) {
    if (!show_image_input) return;
    
    const tr = doc.tr;
    tr.set(doc.selection.path, event.target.value);
    doc.apply(tr);
  }

</script>
    

<div class="editor-toolbar p-1" in:fly={{ duration: 100, y: 5 }} out:fly={{ duration: 100, y: 5 }}>
  
  {#if show_image_input}
    <div class="contextual-input">
      <label>
        Image URL:
        <input 
          type="url" 
          value={current_image_url}
          onchange={update_image_url}
          placeholder="Enter image URL"
        />
      </label>
    </div>
    <hr>
  {/if}
  {#if doc.selection?.type === 'text'}
    <button 
      title='Bold'
      class='bold'
      onclick={() => { const tr = doc.tr; tr.annotate_text('strong'); doc.apply(tr); }}
      disabled={doc.active_annotation() && doc.active_annotation()?.[2] !== 'strong'}
      class:active={doc.active_annotation() && doc.active_annotation()?.[2] === 'strong'}
    >
      <Icon name="bold" />
    </button>
    <button 
      title='Italic'
      class='italic'
      onclick={() => { const tr = doc.tr; tr.annotate_text('emphasis'); doc.apply(tr); }}
      disabled={doc.active_annotation() && doc.active_annotation()?.[2] !== 'emphasis'}
      class:active={doc.active_annotation() && doc.active_annotation()?.[2] === 'emphasis'}
    >
      <Icon name="italic" />
    </button>
    <button 
      title='Link'
      onclick={insert_link} 
      disabled={doc.active_annotation() && doc.active_annotation()?.[2] !== 'link'}
      class:active={doc.active_annotation() && doc.active_annotation()?.[2] === 'link'}
    >
        <Icon name="link" />
      </button>
  {/if}
  {#if doc.selection?.type === 'container' && selected_block?.type === 'story'}

      {#each layout_options as option}
        <button 
          onclick={() => handle_layout_change(option.value)}
          class:active={selected_block.layout === option.value}
        >
          <Icon name={option.icon} />
        </button>
      {/each}
  {/if}
  {#if doc.selection?.type === 'container' && selected_block?.type === 'list'}
    <hr>
      {#each list_style_options as option}
        <button 
          onclick={() => handle_list_style_change(option.value)}
          class:active={selected_block.list_style === option.value}
        >
          <Icon name={option.icon} />
        </button>
      {/each}
  {/if}

  {#if doc.selection?.type === 'text' 
    || (doc.selection?.type === 'container' && selected_block?.type === 'story') 
    || (doc.selection?.type === 'container' && selected_block?.type === 'list')
  }
    <hr>
  {/if}
  <button 
    title='Undo'
    onclick={() => { console.log('Undo clicked, can_undo:', doc.can_undo, 'history_index:', doc.history_index); doc.undo(); }}
    disabled={!doc.can_undo}
  >
    <Icon name="rotate-left" />
  </button>
  <button 
    title='Redo'
    onclick={() => { console.log('Redo clicked, can_redo:', doc.can_redo, 'history_index:', doc.history_index, 'history_length:', doc.history.length); doc.redo(); }}
    disabled={!doc.can_redo}
  >
    <Icon name="rotate-right" />
  </button>
</div>

<style>
  .editor-toolbar {
    color: var(--primary-text-color);
    background-color: var(--canvas-fill-color);
    width: fit-content;
    position: fixed;
    bottom: var(--s-4);
    left: 50%;
    transform: translateX(-50%);
    border-radius: var(--s-2);
    box-shadow: var(--shadow-2);
    display: flex;
    z-index: 50;
    flex-direction: row;
    align-items: center;
    max-width: calc(100vw - 2 * var(--s-4));
    overflow-x: auto;
    scrollbar-width: thin;

    button {
      height: 100%;
      min-height: 44px;
      --icon-color: var(--primary-text-color);
      position: relative;
      &.active {
        color: var(--editing-stroke-color);
        --icon-color: var(--editing-stroke-color);
      }
    }

    .contextual-input {
      display: flex;
      align-items: center;
      gap: var(--s-2);
      
      label {
        display: flex;
        align-items: center;
        gap: var(--s-1);
        font-size: 14px;
        white-space: nowrap;
      }
      
      input {
        padding: var(--s-1) var(--s-2);
        border: 1px solid var(--stroke-color);
        border-radius: var(--s-1);
        background: var(--canvas-fill-color);
        color: var(--primary-text-color);
        font-size: 14px;
        width: 200px;
        
        &:focus {
          outline: none;
          border-color: var(--editing-stroke-color);
        }
      }
    }
    
    hr {
      background-color: var(--stroke-color);
      width: 1px;
      height: 100%;
      border: none;
      margin-inline: var(--s-2);
    }
  }
</style>
