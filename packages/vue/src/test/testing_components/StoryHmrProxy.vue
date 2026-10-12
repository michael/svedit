<script setup lang="ts">
import Story from '../../routes/components/Story.vue';

/**
 * Stand-in for the fresh component reference that Vite/Vue HMR
 * produces when a node component file is saved in dev mode. Swapping
 * `session.config.node_components.story` to this wrapper makes Vue
 * unmount the old story subtree and mount a new one — recreating all
 * node and node-gap DOM elements — without any document change.
 *
 * All props (path, mark, annotations) are forwarded to Story.
 */
defineOptions({ inheritAttrs: false });
</script>

<template>
	<Story v-bind="$attrs as any" />
</template>
