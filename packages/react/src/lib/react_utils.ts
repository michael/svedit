import type { CSSProperties } from 'react';

/**
 * Builds the inline style object for a selectable element: the anchor
 * name derived from the element's path, followed by any consumer-provided
 * style so library declarations are never overridden by accident.
 */
export function anchor_style(anchor_name: string, style?: CSSProperties): CSSProperties {
	return { anchorName: anchor_name, ...style } as CSSProperties;
}

/** Joins class names, skipping empty and false values. */
export function class_names(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(' ');
}
