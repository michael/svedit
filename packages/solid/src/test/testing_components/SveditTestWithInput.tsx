import Svedit from '../../lib/Svedit.js';
import Layout from '../../routes/components/Layout.js';
import type Session from '../../lib/Session.js';

export default function SveditTestWithInput(props: { session: Session<any> }) {
	return (
		<Layout>
			<Svedit session={props.session} editable={true} path={[props.session.doc.document_id]} />
			<input data-testid="external-input" aria-label="External input" />
		</Layout>
	);
}
