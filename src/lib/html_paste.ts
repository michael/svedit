import { safe_html_href } from './html_utils.js';
import type { DocumentNode, DocumentSchema, PropertyDefinition, Text } from './types.js';
import { get_default_text_node, get_text_property_name } from './paste_utils.js';

export type HtmlBlockTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HtmlBlockMapping = {
	type: string;
	text_property: string;
	properties?: Record<string, unknown>;
};
export type HtmlListTag = 'ul' | 'ol';
export type HtmlContainerMapping = {
	type: string;
	children_property: string;
	properties?: Record<string, unknown>;
};
export type HtmlListMapping = HtmlContainerMapping & { item: HtmlBlockMapping };
export type HtmlMarkMapping = { type: string; properties?: Record<string, unknown> };
export type HtmlPasteConfig = {
	blocks?: Partial<
		Record<
			HtmlBlockTag,
			HtmlBlockMapping | ((context: { tag: HtmlBlockTag }) => HtmlBlockMapping | null)
		>
	>;
	lists?: Partial<Record<HtmlListTag, HtmlListMapping>>;
	wrapper?: HtmlContainerMapping;
	marks?: {
		bold?: HtmlMarkMapping;
		link?: HtmlMarkMapping | ((context: { href: string }) => HtmlMarkMapping | null);
	};
};
type InlineStyle = { bold?: boolean; href?: string };
type Run = InlineStyle & { text: string };
type HtmlTextBlock = { tag: HtmlBlockTag; runs: Run[] };
type HtmlListBlock = { tag: HtmlListTag; items: HtmlTextBlock[][] };
export type HtmlPasteBlock = HtmlTextBlock | HtmlListBlock;

/** Parse a detached document; never insert clipboard HTML into the editor DOM. */
export function parse_html_paste(html: string): HtmlPasteBlock[] {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const blocks: HtmlPasteBlock[] = [];
	let current: HtmlTextBlock = { tag: 'p', runs: [] };
	let current_list: HtmlListBlock | null = null;
	let current_item: HtmlTextBlock[] | null = null;
	const flush = () => {
		// HTML whitespace collapses across inline elements, but explicit breaks survive.
		while (current.runs.length && !current.runs[0].text.replace(/^ +/, '')) current.runs.shift();
		if (current.runs.length) current.runs[0].text = current.runs[0].text.replace(/^ +/, '');
		while (current.runs.length && !current.runs.at(-1)!.text.replace(/ +$/, '')) current.runs.pop();
		if (current.runs.length)
			current.runs.at(-1)!.text = current.runs.at(-1)!.text.replace(/ +$/, '');
		// Drop empty paragraphs such as <p><br></p> or Word's <p>&nbsp;</p>.
		if (current.runs.some((run) => run.text.trim())) (current_item || blocks).push(current);
		current = { tag: 'p', runs: [] };
	};
	const walk = (node: Node, style: InlineStyle) => {
		if (node.nodeType === 3) {
			let text = (node.textContent || '').replace(/[\t\n\r\f ]+/g, ' ');
			if (!current.runs.length || /[ \n]$/.test(current.runs.at(-1)!.text))
				text = text.replace(/^ /, '');
			if (text) current.runs.push({ ...style, text });
			return;
		}
		if (node.nodeType !== 1) return;
		const element = node as Element;
		const tag = element.localName;
		if (
			['script', 'style', 'template', 'noscript', 'iframe', 'object', 'svg', 'math'].includes(tag)
		)
			return;
		if (tag === 'br') {
			current.runs.push({ ...style, text: '\n' });
			return;
		}
		const next_style = { ...style };
		if (tag === 'b' || tag === 'strong') next_style.bold = true;
		// Inline font-weight wins over the tag: Google Docs wraps the whole clipboard in
		// <b style="font-weight:normal">, and Docs and Word express bold as styled spans.
		const font_weight = (element as HTMLElement).style?.fontWeight;
		if (font_weight) {
			next_style.bold = ['bold', 'bolder'].includes(font_weight) || Number(font_weight) >= 600;
		}
		if (tag === 'a') next_style.href = safe_html_href(element.getAttribute('href') || '');
		if ((tag === 'ul' || tag === 'ol') && !current_list) {
			flush();
			const list: HtmlListBlock = { tag, items: [] };
			current_list = list;
			for (const child of element.childNodes) walk(child, next_style);
			flush();
			current_list = null;
			list.items = list.items.filter((item) => item.length);
			if (list.items.length) blocks.push(list);
			return;
		}
		// Nested items join the outer list while retaining their own text blocks.
		if (tag === 'li' && current_list) {
			flush();
			const parent_item = current_item;
			current_item = [];
			current_list.items.push(current_item);
			for (const child of element.childNodes) walk(child, next_style);
			flush();
			current_item = parent_item;
			return;
		}
		const is_block =
			/^(p|h[1-6]|div|section|article|header|footer|main|aside|blockquote|pre|ul|ol|li|table|tr|td|th)$/.test(
				tag
			);
		if (is_block) {
			flush();
			current.tag = /^h[1-6]$/.test(tag) ? (tag as HtmlBlockTag) : 'p';
		}
		for (const child of element.childNodes) walk(child, next_style);
		if (is_block) flush();
	};
	for (const child of doc.body.childNodes) walk(child, {});
	flush();
	return blocks;
}

/** Map runs to exclusive Svedit marks. Supported links take precedence over bold. */
export function map_html_text(
	blocks: HtmlPasteBlock[],
	config: HtmlPasteConfig,
	schema: DocumentSchema,
	property: PropertyDefinition,
	nodes: Record<string, DocumentNode>
): Text {
	const result: Text = { content: '', marks: [], annotations: [] };
	const allowed = property.type === 'text' ? property.mark_types || [] : [];
	let previous_key = '';
	const supported = (mapping: HtmlMarkMapping | null | undefined) =>
		mapping && schema[mapping.type]?.kind === 'mark' && allowed.includes(mapping.type)
			? mapping
			: null;
	const text_blocks = blocks.flatMap((block) => ('items' in block ? block.items.flat() : [block]));
	for (const [index, block] of text_blocks.entries()) {
		if (index) {
			result.content += property.type === 'text' && property.allow_newlines ? '\n\n' : ' ';
			previous_key = '';
		}
		for (const run of block.runs) {
			let text =
				property.type === 'text' && property.allow_newlines
					? run.text
					: run.text.replace(/[ \t\r\n\f]+/g, ' ');
			if (property.type === 'text' && !property.allow_newlines && result.content.endsWith(' ')) {
				text = text.replace(/^ +/, '');
			}
			const start_offset = result.content.length;
			result.content += text;
			const end_offset = result.content.length;
			const link = config.marks?.link;
			const mapping =
				(run.href && supported(typeof link === 'function' ? link({ href: run.href }) : link)) ||
				(run.bold && supported(config.marks?.bold));
			const key = mapping ? JSON.stringify(mapping) : '';
			if (mapping && end_offset > start_offset) {
				const previous = result.marks.at(-1);
				if (previous && previous_key === key && previous.end_offset === start_offset)
					previous.end_offset = end_offset;
				else {
					let id_index = Object.keys(nodes).length;
					while (nodes[`html_mark_${id_index}`]) id_index++;
					const id = `html_mark_${id_index}`;
					nodes[id] = { ...mapping.properties, id, type: mapping.type };
					result.marks.push({ node_id: id, start_offset, end_offset });
				}
			}
			previous_key = key;
		}
	}
	// Convert UTF-16 ranges only after the complete string is assembled: a grapheme
	// (such as a combining accent or emoji) can span adjacent HTML elements.
	const boundaries = [
		...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(result.content)
	].map((segment) => segment.index);
	boundaries.push(result.content.length);
	let offset = 0;
	for (const mark of result.marks) {
		while (boundaries[offset + 1] <= mark.start_offset) offset++;
		mark.start_offset = offset;
		while (boundaries[offset + 1] <= mark.end_offset) offset++;
		mark.end_offset = offset;
	}
	result.marks = result.marks.filter((mark) => {
		if (mark.end_offset > mark.start_offset) return true;
		delete nodes[mark.node_id];
		return false;
	});
	return result;
}

export function map_html_blocks(
	blocks: HtmlPasteBlock[],
	config: HtmlPasteConfig,
	schema: DocumentSchema,
	property: PropertyDefinition
) {
	if (property.type !== 'node_array') return null;
	const nodes: Record<string, DocumentNode> = {};
	let node_index = 0;
	const add_node = (type: string, properties: Record<string, unknown>) => {
		const id = `html_block_${node_index++}`;
		nodes[id] = { ...properties, id, type };
		return id;
	};
	const add_text = (blocks: HtmlTextBlock[], mapping: HtmlBlockMapping) =>
		add_node(mapping.type, {
			...mapping.properties,
			[mapping.text_property]: map_html_text(
				blocks,
				config,
				schema,
				schema[mapping.type].properties[mapping.text_property],
				nodes
			)
		});
	const add_container = (mapping: HtmlContainerMapping, children: string[]) =>
		add_node(mapping.type, {
			...mapping.properties,
			[mapping.children_property]: { nodes: children, marks: [], annotations: [] }
		});
	const map_blocks = (blocks: HtmlPasteBlock[], target: PropertyDefinition): string[] | null => {
		if (target.type !== 'node_array') return null;
		const ids: string[] = [];
		for (const block of blocks) {
			if ('items' in block) {
				const mapping = config.lists?.[block.tag];
				const children = mapping && schema[mapping.type]?.properties[mapping.children_property];
				if (
					mapping &&
					target.node_types.includes(mapping.type) &&
					children?.type === 'node_array' &&
					children.node_types.includes(mapping.item.type) &&
					schema[mapping.item.type]?.kind === 'text' &&
					schema[mapping.item.type].properties[mapping.item.text_property]?.type === 'text'
				) {
					ids.push(
						add_container(
							mapping,
							block.items.map((item) => add_text(item, mapping.item))
						)
					);
				} else {
					const items = map_blocks(block.items.flat(), target);
					if (!items) return null;
					ids.push(...items);
				}
				continue;
			}
			const rule = config.blocks?.[block.tag];
			let mapping = typeof rule === 'function' ? rule({ tag: block.tag }) : rule;
			if (
				!mapping ||
				!target.node_types.includes(mapping.type) ||
				schema[mapping.type]?.kind !== 'text' ||
				schema[mapping.type]?.properties[mapping.text_property]?.type !== 'text'
			) {
				const type = get_default_text_node(target, schema);
				const text_property = get_text_property_name(type, schema);
				if (!type || !text_property || !target.node_types.includes(type)) return null;
				mapping = { type, text_property };
			}
			ids.push(add_text([block], mapping));
		}
		return ids.length ? ids : null;
	};
	let main_nodes = map_blocks(blocks, property);
	const wrapper = config.wrapper;
	if (!main_nodes && wrapper && property.node_types.includes(wrapper.type)) {
		const children = schema[wrapper.type]?.properties[wrapper.children_property];
		const ids = children && map_blocks(blocks, children);
		if (ids) main_nodes = [add_container(wrapper, ids)];
	}
	return main_nodes ? { nodes, main_nodes } : null;
}
