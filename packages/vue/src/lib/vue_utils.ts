import { normalizeStyle } from 'vue';

function hyphenate(str: string): string {
	return str.replace(/\B([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Converts a Vue style binding (string, object or array of those) into an
 * inline style string, so library components can prepend their own
 * declarations (e.g. anchor-name) and hand the browser one cssText.
 */
export function style_to_string(style: unknown): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const normalized = normalizeStyle(style as any);
	if (!normalized) return '';
	if (typeof normalized === 'string') return normalized;
	return Object.entries(normalized)
		.filter(([, value]) => value !== null && value !== undefined && value !== '')
		.map(([key, value]) => `${key.startsWith('--') ? key : hyphenate(key)}: ${value};`)
		.join(' ');
}
