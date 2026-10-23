<script setup lang="ts" generic="S extends DocumentSchema">
import {
	computed,
	inject,
	onBeforeUnmount,
	onMounted,
	provide,
	ref,
	watch,
	watchEffect
} from 'vue';

import { CanvasController, check_duplicate_paths } from '@svedit/core';
import { create_node_visibility } from './node_visibility.js';
import DefaultNodeSelectionMarkers from './NodeSelectionMarkers.vue';
import './styles/svedit-colors.css';
import './styles/svedit-animations.css';

import type { DocumentSchema, DocumentPath, SveditContext } from './types.js';
import type { KeyMapper } from '@svedit/core';
import type Session from './Session.js';

/**
 * The editor component: renders the document root inside a contenteditable
 * canvas. Input, composition, clipboard and selection handling live in the
 * shared `CanvasController` from @svedit/core; this component owns the
 * reactive state (editable, canvas focus, composition) and tells the
 * controller when to render the selection.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
	defineProps<{
		/** The schema-typed session instance */
		session: Session<S>;
		/** The path to the root element (e.g. ['page_1']) */
		path: DocumentPath;
		/** The `autocapitalize` attribute on the canvas element */
		autocapitalize?: 'on' | 'off';
		/** The `spellcheck` attribute on the canvas element */
		spellcheck?: 'true' | 'false';
	}>(),
	{ autocapitalize: 'on', spellcheck: 'true' }
);

/** Determines wether the document should be editable or read-only. Two-way bindable. */
const editable = defineModel<boolean>('editable', { default: false });

const canvas_el = ref<HTMLElement>();
const root_node = computed(() => props.session.get(props.path));
const Overlays = computed(() => props.session.config.system_components?.overlays);
const NodeSelectionMarkers = computed(
	() =>
		props.session.config.system_components?.node_selection_markers ?? DefaultNodeSelectionMarkers
);
const RootComponent = computed(() => props.session.config.node_components[root_node.value.type]);

const is_composing = ref(false);
const canvas_focused = ref(false);

// Get KeyMapper from context (may be undefined if not provided)
const key_mapper = inject<KeyMapper | undefined>('key_mapper', undefined);

// The focused state flips synchronously; Vue flushes the DOM update (e.g.
// removal of selection highlight spans) in the microtask right after the
// focus event handler, before the browser processes the click's selection.
const controller = new CanvasController<S>({
	get session() {
		return props.session;
	},
	get path() {
		return props.path;
	},
	get canvas_el() {
		return canvas_el.value;
	},
	get editable() {
		return editable.value;
	},
	get is_composing() {
		return is_composing.value;
	},
	get canvas_focused() {
		return canvas_focused.value;
	},
	key_mapper,
	set_is_composing(value) {
		is_composing.value = value;
	},
	set_canvas_focused(value) {
		canvas_focused.value = value;
	}
});
const focus_canvas = controller.focus_canvas;

const context: SveditContext<S> = {
	get session() {
		return props.session;
	},
	get editable() {
		return editable.value;
	},
	set editable(value) {
		editable.value = value;
	},
	get is_composing() {
		return is_composing.value;
	},
	get canvas_el() {
		return canvas_el.value;
	},
	get canvas_focused() {
		return canvas_focused.value;
	},
	focus_canvas
};

provide('svedit', context);
create_node_visibility(context);

/** Expose function so parent can call it */
defineExpose({ focus_canvas });

// Initialize commands and keymap on the session. Runs after mount and
// re-runs when the session or its config changes.
watchEffect(
	() => {
		props.session.initialize_commands(context);
	},
	{ flush: 'post' }
);

// Render the selection whenever the model selection, the document or the
// canvas focus changes, after the DOM has been updated (flush: 'post').
watch(
	[() => props.session.selection, () => props.session.doc, canvas_focused],
	() => controller.sync_selection(),
	{ flush: 'post' }
);

let stop_listening: (() => void) | undefined;
onMounted(() => {
	check_duplicate_paths(canvas_el.value);
	stop_listening = controller.listen();
});

// Unmounting while focused (route change, remount with a new key) must
// not leave the session keymap on the app's KeyMapper stack; the cleanup
// returned by listen() takes care of that.
onBeforeUnmount(() => stop_listening?.());
</script>

<!-- TODO: move oncut/copy/paste handlers inside .svedit -->
<template>
	<div class="svedit" :class="{ editable }">
		<!-- Overlays must be before canvas so they initialize first. -->
		<component :is="NodeSelectionMarkers" v-if="editable" />
		<component :is="Overlays" v-if="Overlays" />
		<!--
			inputmode is derived from the model selection: when a custom property
			(image, embed, etc.) is selected, set inputmode="none" so iOS does
			not open the virtual keyboard. For any other selection (text, node,
			none), allow the keyboard via inputmode="text". The browser's native
			selection-change flow updates session.selection on tap, which flips
			this attribute before iOS decides whether to show the keyboard — no
			imperative state tracking, drag detection, or click/pointerdown
			handlers are required for keyboard suppression.
		-->
		<div
			ref="canvas_el"
			class="svedit-canvas"
			:class="[
				$attrs.class,
				{
					'hide-selection': editable && session.selection?.type === 'node',
					'node-caret':
						session.selection?.type === 'node' &&
						session.selection.anchor_offset === session.selection.focus_offset,
					'property-selection': session.selection?.type === 'property'
				}
			]"
			:inputmode="session.selection?.type === 'text' ? 'text' : 'none'"
			:contenteditable="editable ? 'true' : 'false'"
			tabindex="-1"
			:autocapitalize="autocapitalize"
			:spellcheck="spellcheck"
			@beforeinput="controller.onbeforeinput"
			@compositionstart="controller.oncompositionstart"
			@compositionend="controller.oncompositionend"
			@focus="controller.onfocus"
			@blur="controller.onblur"
		>
			<component :is="RootComponent" :path="path" />
		</div>
	</div>
</template>

<style scoped>
.svedit-canvas {
	caret-color: var(--editing);
	caret-shape: bar;
	/* Default to vertical/ column flow with: --row: 0; (the most common case)
		Prevents silent failures when developers forget to set the row property in their top level node component.
		TODO: Warn developers in dev mode via console if they forget to set the --row property and use a different flow.*/
	--row: 0;
}
.svedit-canvas:focus {
	outline: none;
}

@media not (pointer: coarse) {
	.svedit-canvas.hide-selection {
		caret-color: transparent;
	}
}

/* When the caret is in a node gap we never want to see the caret */
.svedit-canvas.node-caret,
.svedit-canvas.property-selection {
	caret-color: transparent;
}
</style>

<style>
/* Selection paint — wrapped in :where() so consumers can override with
	   a plain `::selection` rule. Final specificity is just (0,0,1),
	   trivially beatable. */
:where(.svedit-canvas) ::selection {
	background: var(--editing-muted);
}

@media not (pointer: coarse) {
	@supports (anchor-name: --test) {
		.svedit-canvas.hide-selection ::selection {
			background: transparent;
		}
	}
}
</style>
