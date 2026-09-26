import { get_char_length, char_slice } from '$lib/utils.js';

/**
 * An open slash-command trigger ending at the caret.
 */
export type SlashTrigger = {
	/** Character offset of the '/' itself */
	start_offset: number;
	/** The text typed after the '/' */
	query: string;
};

/**
 * Finds a slash-command trigger ending at the caret.
 *
 * The '/' must start a word — at the very beginning of the text or directly
 * after whitespace — so an URL like `https://example.com` or a date like
 * `24/08` never opens the menu. The query stops at the next whitespace or
 * slash, so the menu closes again once the user types past it.
 *
 * @param text - The plain text of the property
 * @param caret_offset - The caret's character offset within that text
 */
export function get_slash_trigger(text: string, caret_offset: number): SlashTrigger | null {
	const before_caret = char_slice(text, 0, caret_offset);
	const match = /(?:^|\s)\/([^\s/]*)$/.exec(before_caret);
	if (!match) return null;

	const query = match[1];
	return {
		start_offset: caret_offset - get_char_length(query) - 1,
		query
	};
}
