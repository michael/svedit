<script>
	import { getContext } from 'svelte';
	import { char_slice, get_char_length, snake_to_pascal } from './utils.js';

	/** @import { AnnotatedTextPropertyProps, Annotation, Fragment } from './types.d.ts'; */

	const svedit = getContext('svedit');

	/** @type {AnnotatedTextPropertyProps} */
	let { path, class: css_class, placeholder = '', tag = 'div', style = '', ...rest } = $props();

	let is_focused = $derived.by(() => {
		return (
			svedit.session.selection?.type === 'text' &&
			path.join('.') === svedit.session.selection?.path.join('.')
		);
	});

	let plain_text = $derived(svedit.session.get(path).text);
	let is_empty = $derived(
		get_char_length(plain_text) === 0 && !(svedit.is_composing && is_focused)
	);

	let fragments = $derived(
		get_fragments(
			svedit.session.get(path).text,
			svedit.session.get(path).annotations
		)
	);

	/**
	 * Converts text with annotations into renderable fragments for display.
	 * @param {string} text - The plain text content
	 * @param {Array<Annotation>} annotations - Array of annotations
	 * @returns {Array<Fragment>} Array of fragments
	 */
	function get_fragments(text, annotations) {
		/** @type {Array<Fragment>} */
		let fragments = [];
		let last_index = 0;

		// Sort annotations by start_offset
		const sorted_annotations = [...annotations].sort((a, b) => a.start_offset - b.start_offset);

		for (const annotation of sorted_annotations) {
			// Add text before this annotation
			if (annotation.start_offset > last_index) {
				fragments.push(char_slice(text, last_index, annotation.start_offset));
			}

			const content = char_slice(text, annotation.start_offset, annotation.end_offset);
			const node = svedit.session.get(annotation.node_id);
			if (!node) throw new Error(`Node not found for annotation ${annotation.node_id}`);

			fragments.push({
				type: 'annotation',
				node,
				content,
				annotation_index: annotations.indexOf(annotation)
			});

			last_index = annotation.end_offset;
		}

		// Add any remaining text
		if (last_index < get_char_length(text)) {
			fragments.push(char_slice(text, last_index));
		}

		return fragments;
	}
</script>

<!-- ATTENTION: The comments are needed to prevent unwanted text nodes with whitespace. -->
<!-- We need to use <br> so the element is reachable by Arrow Up/Down navigation. -->
<!-- But as soon as the element is focused, we get rid of the <br> as it causes issues with caret positioning. -->
<!-- Before, we were just hiding it on focus, but that caused the caret to disappear on Safari Desktop (tested with v26). -->
<!-- Edge Case: Shift Enter stops working if <br> is not present on a non-empty text property. -->
<svelte:element
	this={tag}
	data-type="text"
	data-path={path.join('.')}
	style="anchor-name: --{path.join('-')};{style}"
	class="text svedit-selectable {css_class}"
	class:empty={is_empty}
	class:focused={is_focused}
	class:editable={svedit.editable}
	{placeholder}
	{...rest}
>
	{#each fragments as fragment, index (index)}
		{#if typeof fragment === 'string'}{fragment}{:else if fragment.type === 'annotation'}
			{@const AnnotationComponent =
				svedit.session.config.node_components[snake_to_pascal(fragment.node.type)]}
			<AnnotationComponent
				path={[...path, 'annotations', fragment.annotation_index, 'node_id']}
				content={fragment.content}
			/>
		{/if}
	{/each}<!--
  -->{#if !is_focused || !is_empty}<br />{/if}
</svelte:element>

<style>
	.text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		box-sizing: content-box;
	}
	/* We switch from ::before to ::after when the element is focused. So the the caret is always before the placeholder. */
	[placeholder].empty:not(.focused)::before,
	[placeholder].empty.focused::after {
		content: attr(placeholder);
		pointer-events: none;
		color: color-mix(in oklch, currentcolor 50%, transparent);
	}

	/* Hide flickering: in Chrome, the caret jumps from end of placeholder string to start of text property when we focus */
	.text:not(.focused) {
		caret-color: transparent;
	}

	/* Disable text-transform when editable and focused so users see original text */
	.text.editable.focused {
		text-transform: none !important;
	}
</style>