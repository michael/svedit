import { createRouter, createWebHistory } from 'vue-router';
import Home from './routes/Home.vue';
import PerfHarness from './routes/perftest/PerfHarness.vue';

export default createRouter({
	// The Vue demo is served under /vue/ (vite `base`), both in dev and in the
	// assembled site, so the router needs the same base.
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{ path: '/', component: Home },
		// The framework comparison lives at the site's /perftest (the Svelte
		// demo); it loads /vue/perftest/harness in an iframe.
		{
			path: '/perftest',
			component: Home,
			beforeEnter: () => {
				window.location.replace('/perftest');
				return false;
			}
		},
		{ path: '/perftest/harness', component: PerfHarness }
	]
});
