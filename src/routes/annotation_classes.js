/**
 * Maps the node-array annotations covering a node to CSS classes
 * (styles in styles/annotations.css).
 *
 * `marker` is a data-only annotation: it has no registered component, so
 * Svedit renders no wrapper element for it and it may overlap other
 * annotations. Covered nodes receive it via the `annotations` prop and
 * paint themselves with the classes computed here.
 *
 * @param {Array<import('svedit').NodeArrayAnnotationContext>} annotations
 * @returns {string} Space-separated CSS classes
 */
export function annotation_classes(annotations = []) {
	const classes = [];
	for (const annotation of annotations) {
		if (annotation.node?.type === 'marker') {
			classes.push('marker');
			if (annotation.is_start) classes.push('marker-start');
			if (annotation.is_end) classes.push('marker-end');
		}
	}
	return classes.join(' ');
}
