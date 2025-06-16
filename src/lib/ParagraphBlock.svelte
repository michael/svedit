<script>
  import { getContext } from 'svelte';
  import Block from './Block.svelte';
  import Text from './Text.svelte';
  
  const svedit = getContext('svedit');

  let { path } = $props();
  let block = $derived(svedit.doc.get(path));
</script>

<Block class="paragraph-block max-w-screen-lg mx-auto w-full" {path}>
  <!-- ATTENTION: Do not format the following lines, as whitespace will mess up contenteditable -->
  <Text class='body' path={[...path,'content']} editable={block.editable} />
</Block>

<style>
  :global(.paragraph-block) {
    padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
    padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
    padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
    padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
    padding: var(--s-6);
  }
</style>