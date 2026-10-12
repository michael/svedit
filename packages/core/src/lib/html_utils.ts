/** Escape text or a quoted HTML attribute value. */
export function escape_html(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function safe_html_href(value: string): string | undefined {
	const href = value.trim();
	if (!href || [...href].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127))
		return;
	const scheme = href.match(/^([a-z][a-z\d+.-]*):/i)?.[1].toLowerCase();
	return !scheme || ['http', 'https', 'mailto', 'tel'].includes(scheme) ? href : undefined;
}
