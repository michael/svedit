import './Icon.css';

export default function Icon(props: { name?: string }) {
	return (
		<svg class="icon" role="presentation">
			<use href={`/icons/${props.name ?? 'bullet'}.svg#icon`} />
		</svg>
	);
}
