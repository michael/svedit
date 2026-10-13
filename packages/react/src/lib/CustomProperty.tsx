import { serialize_path } from '@svedit/core';
import { anchor_style } from './react_utils.js';
import type { CustomPropertyProps } from './types.js';
import './CustomProperty.css';

/**
 * Wraps a non-text property (e.g. an image) and gives it a selectable
 * caret position. The property's content is passed as children.
 */
export default function CustomProperty({
	path,
	tag = 'div',
	className,
	style,
	children,
	...rest
}: CustomPropertyProps) {
	const path_str = serialize_path(path);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Tag = tag as any;
	return (
		<Tag
			{...rest}
			className={className}
			data-type="property"
			data-path={path_str}
			style={anchor_style(`--${path_str}`, style)}
		>
			<div className="property-selectable">
				<div className="svedit-selectable">
					<br />
				</div>
			</div>
			{children}
		</Tag>
	);
}
