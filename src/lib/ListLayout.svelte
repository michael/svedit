<script>
  const { children } = $props();
</script>

<div class="list-layout blocks">
  {@render children()}
</div>

<style>
  .list-layout {
    background: #eee;
  }
</style>

