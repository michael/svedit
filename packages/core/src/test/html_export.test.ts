import { describe, expect, it } from 'vitest';
import { export_text_html } from '../lib/html_export.js';
import { escape_html, safe_html_href } from '../lib/html_utils.js';
import type { DocumentNode, SessionConfig, Text } from '../lib/types.js';

const nodes: Record<string, DocumentNode> = {
	bold: { id: 'bold', type: 'strong' },
	link: { id: 'link', type: 'link', href: '/?q="hello"&x=1' }
};
const config: SessionConfig = {
	mark_html_exporters: {
		strong: (_node, content) => `<strong>${content}</strong>`,
		link: (node, content) => {
			const href = safe_html_href(node.href);
			return href ? `<a href="${escape_html(href)}">${content}</a>` : content;
		}
	}
};
const session = { doc: { nodes }, config };

describe('rich-text HTML export', () => {
	it('exports exclusive marks, Unicode, escaped text and line breaks without mutating native data', () => {
		const text: Text = {
			content: '👋🏽 <&\nlink',
			marks: [
				{ node_id: 'bold', start_offset: 0, end_offset: 4 },
				{ node_id: 'link', start_offset: 5, end_offset: 9 }
			],
			annotations: [{ node_id: 'comment', start_offset: 0, end_offset: 9 }]
		};
		const before = JSON.stringify(text);
		expect(export_text_html(text, session)).toBe(
			'<strong>👋🏽 &lt;&amp;</strong><br><a href="/?q=&quot;hello&quot;&amp;x=1">link</a>'
		);
		expect(JSON.stringify(text)).toBe(before);
	});
	it('retains readable text for unconfigured and missing marks', () => {
		const text: Text = {
			content: '<text>',
			marks: [{ node_id: 'missing', start_offset: 0, end_offset: 6 }],
			annotations: []
		};
		expect(export_text_html(text, session)).toBe('&lt;text&gt;');
		expect(
			export_text_html(
				{ ...text, marks: [{ node_id: 'bold', start_offset: 0, end_offset: 6 }] },
				{ doc: { nodes }, config: {} }
			)
		).toBe('&lt;text&gt;');
	});
	it('lets link exporters reject unsafe URLs while retaining link text', () => {
		const text: Text = {
			content: 'link',
			marks: [{ node_id: 'link', start_offset: 0, end_offset: 4 }],
			annotations: []
		};
		expect(
			export_text_html(text, session, { link: { ...nodes.link, href: 'javascript:alert(1)' } })
		).toBe('link');
	});
});
