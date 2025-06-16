<script>
  let {
    path,
    class: css_class,
    style,
    children
  } = $props();
</script>

<div
  class={css_class}
  data-path={path.join('.')}
  data-type="block"
  data-index={path.at(-1)}
  style="anchor-name: --{path.join('-')}; {style}"
>
  {@render children()}
</div>
