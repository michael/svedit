<script>
	let { node, content } = $props();
</script>

<!-- style="anchor-name: --{path.join('-') + '-' + fragment.annotation_index};" -->
<a
  data-node-id={node.id}
  href={node?.href}
  target={node?.target || '_self'}
>{content}</a>
