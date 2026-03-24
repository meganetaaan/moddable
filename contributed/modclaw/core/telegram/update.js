export function extractTelegramMaxUpdateId(buffer) {
	if ("string" !== typeof buffer || !buffer.length)
		return null;

	let found = null;
	const matcher = /"update_id"\s*:\s*(-?\d+)/g;
	for (let match = matcher.exec(buffer); match; match = matcher.exec(buffer)) {
		const value = Number(match[1]);
		if (!Number.isSafeInteger(value) || value < 0)
			continue;
		if ((null === found) || (value > found))
			found = value;
	}
	return found;
}
