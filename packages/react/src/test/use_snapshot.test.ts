import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { Component, createElement } from 'react';
import type { ReactNode } from 'react';
import { Store, useSnapshot, shallow_equal } from '../lib/reactive.js';
import { tick } from './test_utils.js';

class Boundary extends Component<
	{ children?: ReactNode; on_error: (error: Error) => void },
	{ failed: boolean }
> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error: Error) {
		this.props.on_error(error);
	}
	render() {
		return this.state.failed ? null : this.props.children;
	}
}

function Reader({
	store,
	select,
	is_equal
}: {
	store: Store;
	select: () => unknown;
	is_equal?: (a: unknown, b: unknown) => boolean;
}) {
	const value = useSnapshot([store], select, is_equal);
	return createElement('span', { 'data-testid': 'value' }, JSON.stringify(value));
}

describe('useSnapshot', () => {
	it('names the cause when a selector returns a fresh value on every call', async () => {
		// Without this guard React re-renders until "Maximum update depth
		// exceeded", with a stack that points at React internals.
		const store = new Store();
		const errors: Error[] = [];
		const console_error = vi.spyOn(console, 'error').mockImplementation(() => {});
		await render(
			createElement(
				Boundary,
				{ on_error: (error: Error) => errors.push(error) },
				createElement(Reader, {
					store,
					select: () => ({ path: ['a', 'b'] }),
					is_equal: shallow_equal
				})
			)
		);
		await tick();
		console_error.mockRestore();
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].message).toContain('never equal to itself');
	});

	it('accepts a selector whose fresh objects compare equal by content', async () => {
		const store = new Store();
		let count = 0;
		const { container } = await render(
			createElement(Reader, {
				store,
				select: () => ({ count }),
				is_equal: shallow_equal
			})
		);
		await tick();
		expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('{"count":0}');
		count = 1;
		store.notify();
		await tick();
		expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('{"count":1}');
	});
});
