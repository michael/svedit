<script>
  import { fly } from 'svelte/transition';
  import Icon from '$lib/Icon.svelte';

  let {
    entry_session,
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
    const selected_block_path = entry_session.selected_block_path;

    if (selected_block_path) {
      entry_session.set([...selected_block_path, 'layout'], layout_index);
    }
  }

  function handle_list_style_change(list_style) {
    const block = entry_session.selected_block;
    if (block) {
      block.list_style = list_style;
    }
  }

  function insert_link() {
    // if the user cancels the prompt it will use the previous link
    const current_link = entry_session.active_annotation()?.[2] === 'link' 
      ? entry_session.active_annotation()[3].href 
      : '';
    
    const new_url = window.prompt('Enter the URL', current_link);

    // Update if the user didn't cancel the prompt
    if (new_url !== null) {
      entry_session.annotate_text('link', {
        href: new_url // Pass the new_url directly, even if it's an empty string
      });
    }
  }

</script>
    

<div class="editor-toolbar p-1" in:fly={{ duration: 100, y: 5 }} out:fly={{ duration: 100, y: 5 }}>
  {#if entry_session.selection?.type === 'container'}
    <button 
      title='Move up'
      onclick={() => entry_session.move_up()}
      disabled={entry_session.selection.anchor_offset === 0}
      >
        <Icon name="arrow-up-tail" />
      </button>
      <button 
        title='Move down'
        onclick={() => entry_session.move_down()}
        disabled={Math.max(entry_session.selection.anchor_offset, entry_session.selection.focus_offset) === entry_session.get(entry_session.selection.path).length}
        >
        <Icon name="arrow-down-tail" />
      </button>
  {/if}
  {#if entry_session.selection?.type === 'text'}
    <button 
      title='Bold'
      class='bold'
      onclick={() => entry_session.annotate_text('strong')} 
      disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'strong'}
      class:active={entry_session.active_annotation() && entry_session.active_annotation()?.[2] === 'strong'}
    >
      <Icon name="bold" />
    </button>
    <button 
      title='Italic'
      class='italic'
      onclick={() => entry_session.annotate_text('emphasis')} 
      disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'emphasis'}
      class:active={entry_session.active_annotation() && entry_session.active_annotation()?.[2] === 'emphasis'}
    >
      <Icon name="italic" />
    </button>
    <button 
      title='Link'
      onclick={insert_link} 
      disabled={entry_session.active_annotation() && entry_session.active_annotation()?.[2] !== 'link'}
      class:active={entry_session.active_annotation() && entry_session.active_annotation()?.[2] === 'link'}
    >
        <Icon name="link" />
      </button>
  {/if}
  {#if entry_session.selection?.type === 'container' && entry_session.selected_block?.type === 'story'}

      {#each layout_options as option}
        <button 
          onclick={() => handle_layout_change(option.value)}
          class:active={entry_session.selected_block.layout === option.value}
        >
          <Icon name={option.icon} />
        </button>
      {/each}
  {/if}
  {#if entry_session.selection?.type === 'container' && entry_session.selected_block?.type === 'list'}
    <hr>
      {#each list_style_options as option}
        <button 
          onclick={() => handle_list_style_change(option.value)}
          class:active={entry_session.selected_block.list_style === option.value}
        >
          <Icon name={option.icon} />
        </button>
      {/each}
  {/if}

  {#if entry_session.selection?.type === 'text' 
    || (entry_session.selection?.type === 'container' && entry_session.selected_block?.type === 'story') 
    || (entry_session.selection?.type === 'container' && entry_session.selected_block?.type === 'list')
  }
    <hr>
  {/if}
  <button 
    title='Undo'
    onclick={() => entry_session.undo()}
    disabled={entry_session.history.length === 0}
  >
    <Icon name="rotate-left" />
  </button>
  <button 
    title='Redo'
    onclick={() => entry_session.redo()}
    disabled={entry_session.future.length === 0}
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
    top: 50%;
    transform: translateY(-50%);
    left: var(--s-4);
    border-radius: 9999px;
    box-shadow: var(--shadow-2);
    display: flex;
    z-index: 50;
    flex-direction: column;
    align-items: center;

    @media (max-width: 768px) {
      top: auto;
      bottom: var(--s-4);
      left: 50%;
      transform: translateX(-50%);
      flex-direction: row;
      max-width: calc(100vw - 2 * var(--s-4));
      overflow-x: auto;
      scrollbar-width: thin;
    }

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
    hr {
      background-color: var(--stroke-color);
      width: 100%;
      height: 1px;
      border: none;
      margin-block: var(--s-2);
      @media (max-width: 768px) {
        width: 1px;
        height: 100%;
        margin-inline: var(--s-2);
      }
    }
  }
</style>
