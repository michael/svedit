import { createMemo, splitProps } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { serialize_path } from '@svedit/core';
import { anchor_style } from './solid_utils.js';
import type { CustomPropertyProps } from './types.js';
import './CustomProperty.css';

/**
 * Wraps a non-text property (e.g. an image) and gives it a selectable
 * caret position. The property's content is passed as children.
 */
export default function CustomProperty(props: CustomPropertyProps) {
	const [local, rest] = splitProps(props, ['path', 'tag', 'class', 'style', 'children']);
	const path_str = createMemo(() => serialize_path(local.path));
	return (
		<Dynamic
			{...rest}
			component={local.tag ?? 'div'}
			class={local.class}
			data-type="property"
			data-path={path_str()}
			style={anchor_style(`--${path_str()}`, local.style)}
		>
			<div class="property-selectable">
				<div class="svedit-selectable">
					<br />
				</div>
			</div>
			{local.children}
		</Dynamic>
	);
}
