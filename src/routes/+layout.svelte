<script>
  import '$lib/styles/reset.css';
  import '$lib/styles/typography.css';
  import '$lib/styles/colors.css';
  import '$lib/styles/spacing.css';

  let { children } = $props();
</script>

<div class='layout-container'>
  {@render children()}
</div>