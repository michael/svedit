<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { Svedit, Command, KeyMapper, define_keymap } from '@svedit/vue';
import Toolbar from './components/Toolbar.vue';
import create_demo_session from './demo_session.js';

const session = create_demo_session();
const app_el = ref<HTMLElement>();
const svedit_ref = ref<{ focus_canvas: () => void }>();
const editable = ref(true);

function focus_canvas() {
	if (svedit_ref.value) {
		svedit_ref.value.focus_canvas();
	}
}

class EditCommand extends Command {
	is_enabled() {
		// disabled if edit mode is already on
		return !this.context.editable;
	}

	execute() {
		this.context.editable = true;
	}
}

class SaveCommand extends Command {
	is_enabled() {
		// Saving is only possible while edit mode is on.
		return this.context.editable;
	}

	async execute() {
		// Example: async commands are supported
		// await update_document(this.context.session);
		console.log('Document saved', session.to_json());
		this.context.editable = false;
	}
}

const app_command_context = {
	get editable() {
		return editable.value;
	},
	set editable(value) {
		editable.value = value;
	},
	get session() {
		return session;
	},
	get app_el() {
		return app_el.value;
	}
};

const app_commands = {
	edit_document: new EditCommand(app_command_context),
	save_document: new SaveCommand(app_command_context)
};

// Create KeyMapper and provide via context
const key_mapper = new KeyMapper();
provide('key_mapper', key_mapper);

// Push app-level keymap scope
const app_key_map = define_keymap({
	'meta+e,ctrl+e': [app_commands.edit_document],
	'meta+s,ctrl+s': [app_commands.save_document]
});
key_mapper.push_scope(app_key_map);

const handle_keydown = (event: KeyboardEvent) => key_mapper.handle_keydown(event);

onMounted(() => {
	document.title = 'Svedit - Full canvas editing for Vue';
	window.addEventListener('keydown', handle_keydown);
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', handle_keydown);
});
</script>

<template>
	<div ref="app_el" class="demo-wrapper">
		<Svedit
			ref="svedit_ref"
			:session="session"
			v-model:editable="editable"
			:path="[session.doc.document_id]"
		/>
		<!-- The toolbar must render after Svedit: its floating variant is CSS-anchored
		     to elements inside the canvas, and anchors must precede the positioned
		     element in DOM order to be resolvable. -->
		<Toolbar :session="session" :focus_canvas="focus_canvas" v-model:editable="editable" />

		<div v-if="editable" class="debug-panel-wrapper">
			<div class="debug-panel-shell flex-column gap-y-2 w-full max-w-screen-lg mx-auto">
				<p>Selection:</p>
				<pre class="debug-info">{{ JSON.stringify(session.selection || {}, null, '  ') }}</pre>
				<p style="padding-top: 36px">Document:</p>
				<pre class="debug-info">{{ JSON.stringify(session.doc, null, '  ') }}</pre>
			</div>
		</div>
	</div>
</template>

<style scoped>
.debug-panel-wrapper {
	padding-block: var(--s-10);
	/*background: color-mix(in oklch, var(--background) 94%, var(--foreground));*/
}

.debug-panel-shell {
	padding: var(--s-6);
}

.debug-info {
	text-wrap: wrap;
	height: 12lh;
	overflow-y: auto;
	color: var(--foreground);
	background: color-mix(in oklch, var(--background) 98%, var(--foreground));
	border: 1px solid color-mix(in oklch, var(--background) 86%, var(--foreground));
	font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 12px;
	padding: var(--s-4);
}
</style>
