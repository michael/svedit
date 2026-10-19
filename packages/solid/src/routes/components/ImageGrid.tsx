import { Node, NodeArrayProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import './ImageGrid.css';

export default function ImageGrid(props: NodeComponentProps) {
	return (
		<Node path={props.path}>
			<div class="image-grid max-w-screen-lg mx-auto">
				<NodeArrayProperty class="image-grid-items" path={[...props.path, 'image_grid_items']} />
			</div>
		</Node>
	);
}
