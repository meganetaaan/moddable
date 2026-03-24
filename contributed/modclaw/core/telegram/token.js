export function extractTelegramBotId(token) {
	if ("string" !== typeof token || !token.length)
		return null;
	const colon = token.indexOf(":");
	if (colon <= 0)
		return null;
	const prefix = token.slice(0, colon);
	return /^\d+$/.test(prefix) ? prefix : null;
}
