import { Session, fill_document_defaults } from 'svedit';
import { create_demo_doc } from '@svedit/demo-shared/src/demo_doc.js';
import { document_schema } from '@svedit/demo-shared/src/demo_schema.js';
import { app_config } from './demo_config.js';

/** The app's concrete schema-typed session type. */
export type AppSession = Session<typeof document_schema>;

// The Svelte demo is served at the site root, so static assets live under /.
const demo_doc = create_demo_doc(
	{
		name: 'Svelte',
		version: 'Svelte 5',
		site_url: 'https://svelte.dev',
		logo_image: 'svelte-logo.svg',
		framework_image: 'svelte-framework.svg',
		component_file: 'Svedit.svelte'
	},
	'/'
);

export default function create_demo_session(): AppSession {
	const document_with_defaults = fill_document_defaults(demo_doc, document_schema);
	const session = new Session(document_schema, document_with_defaults, app_config);
	return session;
}
