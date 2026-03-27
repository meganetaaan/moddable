import {SLACK_MAX_ALLOWED_USER_IDS} from "../config.js";

function parseSingleSlackUserId(token) {
	if (!token)
		return null;
	if (!/^[UW][A-Z0-9]{8,}$/.test(token))
		return null;
	return token;
}

export function parseSlackUserIds(input, maxIds = SLACK_MAX_ALLOWED_USER_IDS) {
	if ("string" !== typeof input || maxIds <= 0)
		return null;

	const parsed = [];
	for (const rawToken of input.split(",")) {
		const token = rawToken.trim().toUpperCase();
		if (!token)
			continue;
		const userId = parseSingleSlackUserId(token);
		if (!userId)
			return null;
		if (!parsed.includes(userId)) {
			if (parsed.length >= maxIds)
				return null;
			parsed.push(userId);
		}
	}

	return parsed.length ? parsed : null;
}

export function slackUserIdsContain(ids, userId) {
	return Array.isArray(ids) && Boolean(userId) && ids.includes(String(userId).toUpperCase());
}
