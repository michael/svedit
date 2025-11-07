<script>
	let { name = 'bullet', ...rest } = $props();
</script>

<svg class="icon {rest.class}" role="presentation" {...rest}>
	<use href={`/icons/${name}.svg#icon`}></use>
</svg>

<style lang="postcss">
	svg {
		color: var(--icon-color, var(--primary-text-color));
		fill: currentColor;
		user-select: none;
		object-fit: contain;
		object-position: center;
		width: var(--icon-size, 20px);
		height: var(--icon-size, 20px);
	}
</style>
