import { useEffect, useState } from 'react';
import { Node, TextProperty, useNode } from '@svedit/react';
import type { NodeComponentProps } from '@svedit/react';
import type { Nodes } from '@svedit/demo-shared/src/demo_schema.js';
import './Hero.css';

// Static assets live under the app's base URL (/react/ or /vue/ in the
// assembled site, / in a standalone build).
const base = import.meta.env.BASE_URL;

const static_star_count = 0;

export default function Hero({ path }: NodeComponentProps) {
	const node = useNode<Nodes['hero']>(path);
	const has_image = Boolean(node.image && node.image.trim() !== '');
	const [star_count, set_star_count] = useState(static_star_count);
	const formatted_star_count = star_count.toLocaleString();
	const star_count_label = `${formatted_star_count} stars`;

	useEffect(() => {
		let cancelled = false;

		function animate_star_count(target: number) {
			if (target === static_star_count) return;

			const prefers_reduced_motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (prefers_reduced_motion) {
				set_star_count(target);
				return;
			}

			const start = static_star_count;
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

		update_star_count();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<Node
			path={path}
			className={`hero mx-auto w-full ${has_image ? 'has-image' : ''}`}
			style={has_image ? { backgroundImage: `url(${node.image})` } : undefined}
		>
			{has_image && <div className="hero-overlay"></div>}
			<div className="hero-content">
				<TextProperty
					className="hero-title"
					path={[...path, 'title']}
					placeholder="A hero is the prominent, top-most section of a webpage"
				/>
				<TextProperty
					className="hero-subtitle"
					path={[...path, 'description']}
					placeholder="It should be accompanied by a short description."
				/>
				<div className="github-button-wrapper" contentEditable={false}>
					<a
						className="github-repo-link"
						href="https://github.com/michael/svedit"
						target="_blank"
						rel="noreferrer"
						aria-label="Open michael/svedit on GitHub"
					>
						<img src={`${base}images/github.svg`} alt="" aria-hidden="true" />
						<span>Star</span>
						<span className="github-star-count" aria-label={star_count_label}>
							{formatted_star_count}
						</span>
					</a>
				</div>
			</div>
		</Node>
	);
}
