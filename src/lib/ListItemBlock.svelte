<script>
  import Text from '$lib/Text.svelte';

  let {
    path
  } = $props();
</script>

<!-- IMPORTANT: There must not be any white space between the div and <Text>-->
<div
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')};"
><Text path={[...path,'description']} /></div>

<style>
  div {
    position: relative;
    padding-left: 1.5em;
  }
  
  div::before {
    content: '\25E6'; /* Unicode for a hollow circle */
    position: absolute;
    left: 0.5em;
    top: 0;
    font-size: 1em;
  }
</style>