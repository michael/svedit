import { ToggleAnnotationCommand } from 'svedit';

export default {
	name: 'marker',
	schema: {
		// An annotation: data-only, no component allowed, so it may overlap marks
		// and other annotations. Covered node wrappers get `anno-marker` classes
		// automatically, styled in styles/annotations.css.
		marker: {
			kind: 'annotation',
			properties: {}
		}
	},
	commands: (context) => ({
		// Annotations only compete with same-type annotations, so the
		// marker toggle never conflicts with sections or other marks.
		toggle_marker: new ToggleAnnotationCommand('marker', context)
	}),
	keymap: {
		'meta+shift+m,ctrl+shift+m': ['toggle_marker']
	}
};
