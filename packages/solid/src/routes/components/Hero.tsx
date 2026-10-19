import { createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Node, TextProperty } from '@svedit/solid';
import type { NodeComponentProps } from '@svedit/solid';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import { use_app_svedit } from '../svedit_context.js';
import './Hero.css';

// Static assets live under the app's base URL (/solid/ in the assembled
// site, / in a standalone build).
const base = import.meta.env.BASE_URL;

const static_star_count = 0;

export default function Hero(props: NodeComponentProps) {
	const svedit = use_app_svedit();
	const node = createMemo<Nodes['hero']>(() => svedit.session.get(props.path));
	const has_image = createMemo(() => Boolean(node().image && node().image.trim() !== ''));
	const [star_count, set_star_count] = createSignal(static_star_count);
	const formatted_star_count = createMemo(() => star_count().toLocaleString());
	const star_count_label = createMemo(() => `${formatted_star_count()} stars`);

	let cancelled = false;

	function animate_star_count(target: number) {
		if (target === star_count()) return;

		const prefers_reduced_motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefers_reduced_motion) {
			set_star_count(target);
			return;
		}

		const start = star_count();
		const delta = target - start;
		const duration = 900;
		const started_at = performance.now();

		function step(now: number) {
			if (cancelled) return;
			const progress = Math.min((now - started_at) / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);
			set_star_count(Math.round(start + delta * eased));
			if (progress < 1) requestAnimationFrame(step);
		}

		requestAnimationFrame(step);
	}

	async function update_star_count() {
		try {
			const response = await fetch('https://api.github.com/repos/michael/svedit', {
				headers: { Accept: 'application/vnd.github+json' }
			});
			if (!response.ok || cancelled) return;
			const repo = await response.json();
			if (!cancelled && Number.isInteger(repo.stargazers_count)) {
				animate_star_count(repo.stargazers_count);
			}
		} catch {
			// Keep the static fallback when offline or rate-limited.
		}
	}

	onMount(() => {
		cancelled = false;
		update_star_count();
	});

	onCleanup(() => {
		cancelled = true;
	});

	// The overlay is toggled with display: none (like Vue's v-show) instead
	// of conditional rendering, so no placeholder node lands in the canvas.
	return (
		<Node
			path={props.path}
			class={`hero mx-auto w-full ${has_image() ? 'has-image' : ''}`}
			style={has_image() ? `background-image: url(${node().image});` : ''}
		>
			<div class="hero-overlay" style={has_image() ? undefined : 'display: none;'} />
			<div class="hero-content">
				<TextProperty
					class="hero-title"
					path={[...props.path, 'title']}
					placeholder="A hero is the prominent, top-most section of a webpage"
				/>
				<TextProperty
					class="hero-subtitle"
					path={[...props.path, 'description']}
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
						<img src={`${base}images/github.svg`} alt="" aria-hidden="true" />
						<span>Star</span>
						<span class="github-star-count" aria-label={star_count_label()}>
							{formatted_star_count()}
						</span>
					</a>
				</div>
			</div>
		</Node>
	);
}
