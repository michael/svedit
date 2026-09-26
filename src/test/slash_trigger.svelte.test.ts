import { describe, expect, it } from 'vitest';
import { get_slash_trigger } from '../routes/slash_trigger.js';

describe('slash command trigger parsing', () => {
	it('opens on a bare slash at the start of the text', () => {
		expect(get_slash_trigger('/', 1)).toEqual({ start_offset: 0, query: '' });
	});

	it('opens on a slash after whitespace and captures the query', () => {
		expect(get_slash_trigger('Ask /men', 8)).toEqual({ start_offset: 4, query: 'men' });
	});

	it('does not open inside a URL', () => {
		expect(get_slash_trigger('https://example.com', 19)).toBeNull();
	});

	it('does not open inside a date', () => {
		expect(get_slash_trigger('24/08', 5)).toBeNull();
	});

	it('closes once the query runs past a space', () => {
		expect(get_slash_trigger('Ask /men tion', 13)).toBeNull();
	});

	it('closes on a second slash', () => {
		expect(get_slash_trigger('Ask /men/', 9)).toBeNull();
	});

	it('only considers text before the caret', () => {
		// Caret sits before the slash, so nothing is open yet.
		expect(get_slash_trigger('Ask /men', 4)).toBeNull();
	});

	it('reports offsets in characters, not UTF-16 code units', () => {
		// The emoji is two UTF-16 code units but one character, so a naive
		// implementation would report start_offset 3 here instead of 2.
		const trigger = get_slash_trigger('a😀 /me', 6);
		expect(trigger).toEqual({ start_offset: 3, query: 'me' });
	});
});
