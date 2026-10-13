import Svedit from '../../lib/Svedit.js';
import Layout from '../../routes/components/Layout.js';
import type { Session } from '@svedit/core';

export default function SveditTest({ session }: { session: Session<any> }) {
	return (
		<Layout>
			<Svedit session={session} editable={true} path={[session.doc.document_id]} />
		</Layout>
	);
}
