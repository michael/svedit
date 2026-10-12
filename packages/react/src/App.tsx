import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

// The React demo is served under /react/ (vite `base`), both in dev and in
// the assembled site, so the router needs the same basename.
import Layout from './routes/components/Layout.js';
import Home from './routes/Home.js';
import PerfHarness from './routes/perftest/PerfHarness.js';

// The framework comparison lives at the site's /perftest (the Svelte demo);
// it loads /react/perftest/harness in an iframe.
function RedirectToComparison() {
	useEffect(() => window.location.replace('/perftest'), []);
	return null;
}

export default function App() {
	return (
		<BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
			<Layout>
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/perftest" element={<RedirectToComparison />} />
					<Route path="/perftest/harness" element={<PerfHarness />} />
				</Routes>
			</Layout>
		</BrowserRouter>
	);
}
