import './Icon.css';

export default function Icon({ name = 'bullet' }: { name?: string }) {
	return (
		<svg className="icon" role="presentation">
			<use href={`/icons/${name}.svg#icon`}></use>
		</svg>
	);
}
