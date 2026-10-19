import { createMemo } from 'solid-js';
import { Node, TextProperty, CustomProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './ImageGridItem.css';

// Static assets live under the app's base URL (/solid/ in the assembled
// site, / in a standalone build).
const base = import.meta.env.BASE_URL;

// ATTENTION: Keep the caption's children free of stray text nodes, whitespace would mess up contenteditable
export default function ImageGridItem(props: NodeComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['image_grid_item']>(() => svedit.session.get(props.path));
	return (
		<Node path={props.path}>
			<div class="image-grid-item flex-column gap-y-3">
				<CustomProperty class="image-wrapper" path={[...props.path, 'image']}>
					<div contenteditable="false" style={{ 'aspect-ratio': '1/1', width: '100%' }}>
						<img
							src={node().image || `${base}icons/image-placeholder.svg`}
							alt={node().title.content}
							classList={{ placeholder: !node().image }}
						/>
					</div>
				</CustomProperty>
				<div class="caption flex-column gap-y-3">
					<TextProperty
						class="heading3"
						path={[...props.path, 'title']}
						placeholder="Gallery item title"
					/>
					<TextProperty class="body" path={[...props.path, 'description']} placeholder="Details" />
				</div>
			</div>
		</Node>
	);
}
