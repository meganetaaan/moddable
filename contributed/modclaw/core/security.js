function containsToken(lower, token) {
	return lower.includes(token);
}

export function securityKeyIsSensitive(key) {
	if (!key)
		return false;

	const lower = String(key).toLowerCase();
	return containsToken(lower, "pass") ||
		containsToken(lower, "token") ||
		containsToken(lower, "secret") ||
		containsToken(lower, "apikey") ||
		containsToken(lower, "api_key") ||
		containsToken(lower, "auth");
}
