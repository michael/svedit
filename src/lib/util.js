import { customAlphabet } from "nanoid";

const _nanoid = customAlphabet(
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz",
  23
);

// A Svedit ID (svid) is a nanoid of length 23 with no numbers and no "_" or "-" to be used as HTML ids
export function svid() {
  return _nanoid();
}

export function is_valid_svid(id) {
	return /^[a-zA-Z]{23}$/i.test(id);
}

// Check if a node conforms to its schema
export function validate_node(node, schema) {
	if (!node.id || !is_valid_svid(node.id)) {
		throw new Error('Node ' + node.id + ' has an invalid id. Must be a SVID.');
	}
	if (!node.type || !schema[node.type]) {
		throw new Error('Node ' + node.id + ' has an invalid type: ' + node.type);
	}
	for (const [key, property] of Object.entries(schema[node.type])) {
		if (property.type === 'integer') {
			if (typeof node[key] !== 'number') {
				throw new Error('Node ' + node.id + ' has an invalid property: ' + key + ' must be an integer.');
			}
		}

		if (property.type === 'string') {
			if (typeof node[key] !== 'string') {
				throw new Error('Node ' + node.id + ' has an invalid property: ' + key + ' must be a string.');
			}
		}

		if (property.type === 'ref') {
			if (typeof node[key] !== 'string' || !is_valid_svid(node[key])) {
				throw new Error('Node ' + node.id + ' has an invalid property: ' + key + ' must be a SVID.');
			}
		}

		if (property.type === 'multiref') {
			if (!Array.isArray(node[key]) || !node[key].every(id => is_valid_svid(id))) {
				throw new Error('Node ' + node.id + ' has an invalid property: ' + key + ' must be an array of SVIDs.');
			}
		}
	}
}
