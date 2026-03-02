const DOM_PATH_SEGMENT_DELIMITER = '|';
const DOM_PATH_STRING_PREFIX = 's:';
const DOM_PATH_NUMBER_PREFIX = 'n:';
const DOM_PATH_INTEGER_PATTERN = /^-?\d+$/;

/**
 * Serialize a document path for DOM data attributes.
 *
 * We include explicit type prefixes per segment, so decode stays lossless:
 * - string segment => "s:<uri-encoded>"
 * - number segment => "n:<integer>"
 *
 * @param {Array<string|number>} path
 * @returns {string}
 */
export function serialize_dom_path(path) {
	if (!Array.isArray(path)) {
		throw new Error(`serialize_dom_path expected array, got ${typeof path}`);
	}
	return path
		.map((segment) => {
			if (typeof segment === 'number') {
				if (!Number.isInteger(segment)) {
					throw new Error(`serialize_dom_path expected integer segment, got ${segment}`);
				}
				return `${DOM_PATH_NUMBER_PREFIX}${segment}`;
			}
			if (typeof segment !== 'string') {
				throw new Error(`serialize_dom_path expected string segment, got ${typeof segment}`);
			}
			return `${DOM_PATH_STRING_PREFIX}${encodeURIComponent(segment)}`;
		})
		.join(DOM_PATH_SEGMENT_DELIMITER);
}

/**
 * Deserialize a DOM path key back to a document path.
 *
 * @param {string} path_key
 * @param {{ allow_legacy_dot_path?: boolean }} [context]
 * @returns {Array<string|number>}
 */
export function deserialize_dom_path(path_key, context = {}) {
	if (typeof path_key !== 'string') {
		throw new Error(`deserialize_dom_path expected string, got ${typeof path_key}`);
	}
	if (path_key.length === 0) return [];

	const allow_legacy_dot_path = context.allow_legacy_dot_path ?? true;
	const segments = path_key.split(DOM_PATH_SEGMENT_DELIMITER);
	const decoded_segments = [];

	for (const segment of segments) {
		if (segment.startsWith(DOM_PATH_NUMBER_PREFIX)) {
			const value = segment.slice(DOM_PATH_NUMBER_PREFIX.length);
			if (!DOM_PATH_INTEGER_PATTERN.test(value)) {
				throw new Error(`Invalid numeric DOM path segment "${segment}"`);
			}
			decoded_segments.push(parseInt(value, 10));
			continue;
		}
		if (segment.startsWith(DOM_PATH_STRING_PREFIX)) {
			const value = segment.slice(DOM_PATH_STRING_PREFIX.length);
			decoded_segments.push(decodeURIComponent(value));
			continue;
		}
		if (allow_legacy_dot_path) {
			return path_key.split('.');
		}
		throw new Error(`Invalid DOM path segment "${segment}"`);
	}

	return decoded_segments;
}
