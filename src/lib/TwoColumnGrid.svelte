<script>
  const { children } = $props();
</script>

<div class="two-column-grid blocks">
  {@render children()}
</div>

<style>
  .two-column-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    width: 100%;
  }
</style>

