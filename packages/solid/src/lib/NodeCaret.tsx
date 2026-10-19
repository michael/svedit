import './NodeCaret.css';

/**
 * Visual insertion caret rendered inside the active insertion marker.
 *
 * This component is presentation-only. It reads styling tokens for
 * color/shape/animation and switches orientation via var(--row, 1)
 * with the * 99999 multiplier trick — works in all browsers.
 */
export default function NodeCaret() {
	return <div class="svedit-caret" role="none" />;
}
