import { onMount } from 'solid-js';
import { Route, Router } from '@solidjs/router';

// The Solid demo is served under /solid/ (vite `base`), both in dev and in
// the assembled site, so the router needs the same base.
import Layout from './routes/components/Layout.js';
import Home from './routes/Home.js';
import PerfHarness from './routes/perftest/PerfHarness.js';

// The framework comparison lives at the site's /perftest (the Svelte demo);
// it loads /solid/perftest/harness in an iframe.
function RedirectToComparison() {
	onMount(() => window.location.replace('/perftest'));
	return null;
}

export default function App() {
	return (
		<Router base={import.meta.env.BASE_URL.replace(/\/$/, '')} root={Layout}>
			<Route path="/" component={Home} />
			<Route path="/perftest" component={RedirectToComparison} />
			<Route path="/perftest/harness" component={PerfHarness} />
		</Router>
	);
}
