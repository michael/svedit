import { Session, fill_document_defaults } from 'svedit';
import { app_config } from './app_config.js';
import { demo_doc } from './demo_doc.js';
import { document_schema } from './document_schema.js';

/** The app's concrete schema-typed session type. */
export type AppSession = Session<typeof document_schema>;

export default function create_demo_session(): AppSession {
	const document_with_defaults = fill_document_defaults(demo_doc, document_schema);
	const session = new Session(document_schema, document_with_defaults, app_config);
	return session;
}
