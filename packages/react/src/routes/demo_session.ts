import { Session, fill_document_defaults } from '@svedit/react';
import { create_demo_doc } from '@svedit/demo-shared/src/demo_doc.js';
import { document_schema } from '@svedit/demo-shared/src/demo_schema.js';
import { app_config } from './demo_config.js';

/** The app's concrete schema-typed session type. */
export type AppSession = Session<typeof document_schema>;

// Static assets live under the app's base URL (/react/ in the assembled site,
// / in a standalone build).
const demo_doc = create_demo_doc(
	{
		name: 'React',
		version: 'React 19',
		site_url: 'https://react.dev',
		logo_image: 'react-logo.svg',
		framework_image: 'react-framework.svg',
		component_file: 'Svedit.tsx'
	},
	import.meta.env.BASE_URL
);

export default function create_demo_session(): AppSession {
	const document_with_defaults = fill_document_defaults(demo_doc, document_schema);
	const session = new Session(document_schema, document_with_defaults, app_config);
	return session;
}
