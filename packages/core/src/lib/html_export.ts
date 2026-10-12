import type { DocumentNode, SessionConfig, Text } from './types.js';
import { escape_html } from './html_utils.js';

/** Receives already escaped inline HTML. Exporters must escape attribute values. */
export type MarkHtmlExporter = (node: DocumentNode, content: string) => string;

/** Export exclusive marks as inline HTML; data-only annotations remain in the native payload. */
export function export_text_html(
	text: Text,
	session: { doc: { nodes: Record<string, DocumentNode> }; config: SessionConfig },
	nodes = session.doc.nodes
): string {
	const characters = [
		...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text.content)
	].map((segment) => segment.segment);
	const slice = (start: number, end: number) =>
		escape_html(characters.slice(start, end).join('')).replace(/\r\n|\r|\n/g, '<br>');
	let html = '';
	let offset = 0;
	for (const mark of [...text.marks].sort((a, b) => a.start_offset - b.start_offset)) {
		if (
			!Number.isInteger(mark.start_offset) ||
			!Number.isInteger(mark.end_offset) ||
			mark.start_offset < offset ||
			mark.end_offset > characters.length ||
			mark.end_offset <= mark.start_offset
		)
			continue;
		html += slice(offset, mark.start_offset);
		const content = slice(mark.start_offset, mark.end_offset);
		const node = nodes[mark.node_id];
		const exporter = node && session.config.mark_html_exporters?.[node.type];
		html += exporter ? exporter(node, content) : content;
		offset = mark.end_offset;
	}
	return html + slice(offset, characters.length);
}
