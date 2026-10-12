<script setup lang="ts">
withDefaults(defineProps<{ name?: string }>(), { name: 'bullet' });
</script>

<template>
	<svg class="icon" role="presentation">
		<use :href="`/icons/${name}.svg#icon`"></use>
	</svg>
</template>

<style scoped>
svg {
	color: var(--icon-color, var(--foreground));
	fill: currentColor;
	user-select: none;
	object-fit: contain;
	object-position: center;
	width: var(--icon-size, 24px);
	height: var(--icon-size, 24px);
}
</style>
