<script>
  import '$lib/styles/reset.css';

  let { children } = $props();
</script>

<div class='layout-container'>
  {@render children()}
</div>