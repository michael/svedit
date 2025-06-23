<script>
  import '../styles/reset.css';
  import '../styles/typography.css';
  import '../styles/colors.css';
  import '../styles/spacing.css';
  import '../styles/shadows.css';

  let { children } = $props();
</script>

<div class='layout-container'>
  {@render children()}
</div>
