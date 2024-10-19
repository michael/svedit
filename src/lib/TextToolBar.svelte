<script>
  import { fly } from 'svelte/transition';
  import Icon from '$lib/Icon.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  let { entry_session } = $props();

  // Visual Viewport handling:
  // Position the toolbar above the soft keyboard
  // This prevents the keyboard from overlapping the toolbar on mobile devices
  // 
  // Issue with current approach:
  // When changing scroll direction, browsers (e.g., Safari) initially adjust the visual viewport
  // instead of scrolling the page. This continues until the viewport shift equals the difference
  // between the initial scroll position and the screen height minus the visual viewport height.
  // 
  // During this adjustment period, the toolbar's position appears incorrect:
  // - When scrolling up: Not an issue, as the toolbar is temporarily hidden below the keyboard.
  // - When scrolling down: The toolbar appears above the content, away from the visual viewport's
  //   bottom edge. This creates a risk of users accidentally tapping toolbar buttons while scrolling.
  //
  // The toolbar's position only normalizes once actual page scrolling begins.
  //
  // Workarounds:
  // - checking the scroll direction and temporarily hiding the toolbar could be a workaround. But there seems to be also a delay…
  // Using this new API (not yet supported): navigator.virtualKeyboard.addEventListener("geometrychange", () => {})
  //
  // Related resources to this open issue:
  // https://developer.chrome.com/docs/web-platform/virtual-keyboard
  // https://ishadeed.com/article/virtual-keyboard-api/
  // https://developer.chrome.com/blog/viewport-resize-behavior
  // https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/VirtualKeyboardAPI/explainer.md
  // https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/
  // https://blog.opendigerati.com/the-eccentric-ways-of-ios-safari-with-the-keyboard-b5aa3f34228d
  // 
  // Bug report for Safari:
  // https://bugs.webkit.org/show_bug.cgi?id=230225


  function updateViewport() {
    if (browser) {
      const viewport_height = window.visualViewport?.height || window.innerHeight;
      const viewport_offset = window.visualViewport?.offsetTop || 0;
      const toolbar_top_position = viewport_height + viewport_offset - 60; // 44 (toolbar height) + 16 (bottom offset)
      document.documentElement.style.setProperty('--toolbar-top-position', `${toolbar_top_position}px`);
    }
  }

  onMount(() => {
    if (browser) {
      updateViewport();
      window.visualViewport?.addEventListener('resize', updateViewport);
      window.visualViewport?.addEventListener('scroll', updateViewport);
    }
  });

  onDestroy(() => {
    if (browser) {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
    }
  });

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
    entry_session.annotate_text('link', {
      href: window.prompt('Enter the URL')
    });
  }

</script>
    

<div
  class="editor-toolbar p-1" 
  in:fly={{ duration: 100, y: 5 }} 
  out:fly={{ duration: 100, y: 5 }}
>
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
  /* only use the javascript visual viewport placement technique when the contenteditable is focused */
  @media (max-width: 768px) {
    :global(body:has(:is([contenteditable="true"]):focus)) {
      .editor-toolbar {
        top: var(--toolbar-top-position);
        bottom: auto;
      }
    }
  }

  .editor-toolbar {
    --toolbar-height: 44px;
    --toolbar-bottom-offset: var(--s-4);
    color: var(--primary-text-color);
    background-color: var(--canvas-fill-color);
    width: fit-content;
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    left: var(--s-4);
    border-radius: 9999px;
    box-shadow: 0 0 1px oklch(0 0 0 / 0.3), 0 0 2px oklch(0 0 0 / 0.1), 0 0 10px oklch(0 0 0 / 0.05);
    display: flex;
    z-index: 50;
    flex-direction: column;
    align-items: center;
    transition: all 0.1s ease-in-out 200ms;
    overflow-y: hidden;

    @media (max-width: 768px) {
      top: auto;
      /* alternative css only approach for Chromium / Android */
      bottom: max(calc(env(keyboard-inset-height, 0px) + var(--toolbar-bottom-offset)), var(--toolbar-bottom-offset));
      left: 50%;
      transform: translateX(-50%);
      flex-direction: row;
      max-width: calc(100vw - 2 * var(--s-4));
      height: var(--toolbar-height);
      overflow-x: auto;
      scrollbar-width: thin;
    }

    button {
      height: 100%;
      min-height: var(--toolbar-height);
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
