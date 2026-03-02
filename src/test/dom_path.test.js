import { describe, it, expect } from 'vitest';
import { serialize_dom_path, deserialize_dom_path } from '../lib/dom_path.js';

describe('dom_path', () => {
	it('round-trips mixed path segments losslessly', () => {
		const path = ['page_1', 'body', 0, 'image_grid_items', 12, '123'];
		const encoded = serialize_dom_path(path);
		const decoded = deserialize_dom_path(encoded);
		expect(decoded).toEqual(path);
	});

	it('preserves numeric-looking string IDs', () => {
		const path = ['123', 'body', 0, 'items'];
		const encoded = serialize_dom_path(path);
		const decoded = deserialize_dom_path(encoded);
		expect(decoded[0]).toBe('123');
		expect(typeof decoded[0]).toBe('string');
		expect(decoded[2]).toBe(0);
		expect(typeof decoded[2]).toBe('number');
	});

	it('supports legacy dot paths when enabled', () => {
		const decoded = deserialize_dom_path('page_1.body.0.items', { allow_legacy_dot_path: true });
		expect(decoded).toEqual(['page_1', 'body', '0', 'items']);
	});

	it('rejects invalid encoded segments without legacy fallback', () => {
		expect(() =>
			deserialize_dom_path('page_1.body.0.items', { allow_legacy_dot_path: false })
		).toThrow();
	});
});
