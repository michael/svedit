import type { JSX } from 'solid-js';

function hyphenate(str: string): string {
	return str.replace(/\B([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Converts a Solid style prop (string or object) into an inline style
 * string. Object keys may be kebab-case (Solid's convention) or camelCase.
 */
export function style_to_string(style: JSX.CSSProperties | string | undefined): string {
	if (!style) return '';
	if (typeof style === 'string') return style;
	return Object.entries(style)
		.filter(([, value]) => value !== null && value !== undefined && value !== '')
		.map(([key, value]) => `${key.startsWith('--') ? key : hyphenate(key)}: ${value};`)
		.join(' ');
}

/**
 * Builds the inline style for a selectable element: the anchor name derived
 * from the element's path, followed by any consumer-provided style, so
 * library declarations come first and consumers can still add their own.
 */
export function anchor_style(anchor_name: string, style?: JSX.CSSProperties | string): string {
	const extra = style_to_string(style);
	return `anchor-name: ${anchor_name};${extra ? ` ${extra}` : ''}`;
}

/** Joins class names, skipping empty and false values. */
export function class_names(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(' ');
}
