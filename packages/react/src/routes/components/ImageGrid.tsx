import { Node, NodeArrayProperty } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import './ImageGrid.css';

export default function ImageGrid({ path }: NodeComponentProps) {
	return (
		<Node path={path}>
			<div className="image-grid max-w-screen-lg mx-auto">
				<NodeArrayProperty className="image-grid-items" path={[...path, 'image_grid_items']} />
			</div>
		</Node>
	);
}
