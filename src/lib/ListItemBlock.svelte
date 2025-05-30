<script>
  import Text from '$lib/Text.svelte';

  let {
    path,
    /** @type {('decimal'|'decimal-leading-zero'|'lower-roman'|'upper-roman'|'lower-latin'|'upper-latin'|'disc'|'circle'|'square')} */
    list_style
  } = $props();

</script>

<!-- IMPORTANT: There must not be any white space between the div and <Text>-->
<div
  class='list-item'
  style:--list-style={list_style}
  data-path={path.join('.')}
  data-type='block'
  data-index={path.at(-1)}
  style='anchor-name: --{path.join('-')};'
><Text path={[...path,'content']} /></div>

<style>
  div {
    position: relative;
    padding-left: 3em;
  }
  
  div::before {
    position: absolute;
    left: 0;
    top: 0;
    font-size: 1em;
    content: counter(listcounter, var(--list-style));   
    color: var(--primary-fill-color);
  }

  /* CSS Counter initiation */
  :global(* > .list-item:first-of-type) {
    counter-reset: listcounter;
    counter-increment: listcounter;
  }
  :global(.list-item + .list-item) {
    counter-increment: listcounter;
  }
</style>