import { Node, TextProperty, CustomProperty, useNode } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './ImageGridItem.css';

// Static assets live under the app's base URL (/react/ or /vue/ in the
// assembled site, / in a standalone build).
const base = import.meta.env.BASE_URL;

// ATTENTION: Keep the caption's children free of stray text nodes, whitespace would mess up contenteditable
export default function ImageGridItem({ path }: NodeComponentProps) {
	const node = useNode<Nodes['image_grid_item']>(path);
	return (
		<Node path={path}>
			<div className="image-grid-item flex-column gap-y-3">
				<CustomProperty className="image-wrapper" path={[...path, 'image']}>
					<div contentEditable={false} style={{ aspectRatio: '1/1', width: '100%' }}>
						<img
							src={node.image || `${base}icons/image-placeholder.svg`}
							alt={node.title.content}
							className={node.image ? undefined : 'placeholder'}
						/>
					</div>
				</CustomProperty>
				<div className="caption flex-column gap-y-3">
					<TextProperty
						className="heading3"
						path={[...path, 'title']}
						placeholder="Gallery item title"
					/>
					<TextProperty className="body" path={[...path, 'description']} placeholder="Details" />
				</div>
			</div>
		</Node>
	);
}
