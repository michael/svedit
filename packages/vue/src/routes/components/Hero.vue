<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Node, TextProperty } from '@svedit/vue';
import type { DocumentPath } from '@svedit/vue';
import { get_svedit_context } from '../svedit_context.js';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';

// Static assets live under the app's base URL (/vue/ in the assembled site).
const base = import.meta.env.BASE_URL;

const svedit = get_svedit_context();

const props = defineProps<{ path: DocumentPath }>();
const node = computed<Nodes['hero']>(() => svedit.session.get(props.path));
const has_image = computed(() => Boolean(node.value.image && node.value.image.trim() !== ''));
const static_star_count = 0;
const star_count = ref(static_star_count);
const formatted_star_count = computed(() => star_count.value.toLocaleString());
const star_count_label = computed(() => `${formatted_star_count.value} stars`);

function animate_star_count(target: number, is_cancelled: () => boolean) {
	if (target === star_count.value) return;

	const prefers_reduced_motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (prefers_reduced_motion) {
		star_count.value = target;
		return;
	}

	const start = star_count.value;
	const delta = target - start;
	const duration = 900;
	const started_at = performance.now();

	function step(now: number) {
		if (is_cancelled()) return;
		const progress = Math.min((now - started_at) / duration, 1);
		const eased = 1 - Math.pow(1 - progress, 3);
		star_count.value = Math.round(start + delta * eased);
		if (progress < 1) requestAnimationFrame(step);
	}

	requestAnimationFrame(step);
}

let cancelled = false;

async function update_star_count() {
	try {
		const response = await fetch('https://api.github.com/repos/michael/svedit', {
			headers: { Accept: 'application/vnd.github+json' }
		});
		if (!response.ok || cancelled) return;
		const repo = await response.json();
		if (!cancelled && Number.isInteger(repo.stargazers_count)) {
			animate_star_count(repo.stargazers_count, () => cancelled);
		}
	} catch {
		// Keep the static fallback when offline or rate-limited.
	}
}

onMounted(() => {
	cancelled = false;
	update_star_count();
});

onBeforeUnmount(() => {
	cancelled = true;
});
</script>

<template>
	<Node
		:path="path"
		:class="`hero mx-auto w-full ${has_image ? 'has-image' : ''}`"
		:style="has_image ? `background-image: url(${node.image});` : ''"
	>
		<div v-show="has_image" class="hero-overlay"></div>
		<div class="hero-content">
			<TextProperty
				class="hero-title"
				:path="[...path, 'title']"
				placeholder="A hero is the prominent, top-most section of a webpage"
			/>
			<TextProperty
				class="hero-subtitle"
				:path="[...path, 'description']"
				placeholder="It should be accompanied by a short description."
			/>
			<div class="github-button-wrapper" contenteditable="false">
				<a
					class="github-repo-link"
					href="https://github.com/michael/svedit"
					target="_blank"
					rel="noreferrer"
					aria-label="Open michael/svedit on GitHub"
				>
					<img :src="`${base}images/github.svg`" alt="" aria-hidden="true" />
					<span>Star</span>
					<span class="github-star-count" :aria-label="star_count_label">{{
						formatted_star_count
					}}</span>
				</a>
			</div>
		</div>
	</Node>
</template>

<style>
.hero {
	padding-inline-start: max(var(--s-10), env(safe-area-inset-left, 0px));
	padding-inline-end: max(var(--s-10), env(safe-area-inset-right, 0px));
	padding-block-start: max(var(--s-10), env(safe-area-inset-top, 0px));
	padding-block-end: max(var(--s-10), env(safe-area-inset-bottom, 0px));
	padding: 100px var(--s-6);
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 50vh;
	position: relative;
	overflow: hidden;
}

.hero.has-image {
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
}

.hero .hero-title {
	/* Span the content column (text stays centered): shrink-wrapped, a hero text
	   holding only newlines would collapse to 0px and lose its caret. */
	width: 100%;
	font-size: 3rem;
	font-weight: 700;
	font-variation-settings: 'wght' 700;
	line-height: 1.2;
	margin-bottom: var(--s-6);
	color: var(--foreground);
	letter-spacing: -0.03em;
}

.hero .hero-subtitle {
	/* Span the content column (text stays centered): shrink-wrapped, a hero text
	   holding only newlines would collapse to 0px and lose its caret. */
	width: 100%;
	font-size: 1.7rem;
	line-height: 1.6;
	color: var(--foreground);
	opacity: 0.95;
	max-width: 600px;
	margin: 0 auto;
}

.hero.has-image .hero-title {
	color: var(--foreground);
}

.hero.has-image .hero-subtitle {
	color: var(--foreground);
	opacity: 0.95;
}

.hero a {
	color: var(--accent);
	text-decoration-line: underline;
	text-decoration-color: var(--accent);
	text-underline-offset: 0.15em;
}

@media (max-width: 768px) {
	.hero .hero-title {
		font-size: 2.5rem;
	}

	.hero .hero-subtitle {
		font-size: 1.125rem;
	}
}

@media (max-width: 480px) {
	.hero .hero-title {
		font-size: 2rem;
	}

	.hero .hero-subtitle {
		font-size: 1rem;
	}
}
</style>

<style scoped>
.github-button-wrapper {
	margin-top: var(--s-6);
	cursor: pointer;
}

.github-repo-link {
	display: inline-flex;
	align-items: center;
	gap: 0.5em;
	border: 1px solid color-mix(in oklch, var(--background) 86%, var(--foreground));
	border-radius: 9999px;
	background: var(--background);
	padding: 0.5em 0.85em;
	color: var(--foreground);
	font-size: 0.95rem;
	font-weight: 650;
	line-height: 1;
	text-decoration: none;
	box-shadow: 0 1px 2px color-mix(in oklch, var(--foreground) 10%, transparent);
}

.github-repo-link:hover {
	border-color: color-mix(in oklch, var(--background) 72%, var(--foreground));
	background: color-mix(in oklch, var(--background) 96%, var(--foreground));
}

.github-repo-link img {
	width: 1.1em;
	height: 1.1em;
}

.github-star-count {
	margin-inline-start: 0.1em;
	border-inline-start: 1px solid color-mix(in oklch, var(--background) 82%, var(--foreground));
	padding-inline-start: 0.6em;
	font-variant-numeric: tabular-nums;
	opacity: 0.75;
}

.hero-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.4);
	z-index: 1;
}

.hero-content {
	text-align: center;
	max-width: 512px;
	width: 100%;
	position: relative;
	z-index: 2;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.hero-content::before {
	content: '';
	display: block;
	width: 3.5rem;
	height: 0.22rem;
	margin-bottom: var(--s-5);
	background: var(--accent);
	border-radius: 9999px;
}
</style>
