export function uuid() {
	return crypto.randomUUID().replace(/-/g, '')
}

export function is_valid_uuid(uuid) {
	return /^[0-9a-f]{32}$/i.test(uuid);
}
