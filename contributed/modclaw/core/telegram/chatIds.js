import {TELEGRAM_MAX_ALLOWED_CHAT_IDS} from "../config.js";

function parseSingleChatId(token) {
	if (!token)
		return null;
	if (!/^-?\d+$/.test(token))
		return null;
	const value = Number(token);
	if (!Number.isSafeInteger(value) || 0 === value)
		return null;
	return value;
}

export function parseTelegramChatIds(input, maxIds = TELEGRAM_MAX_ALLOWED_CHAT_IDS) {
	if ("string" !== typeof input || maxIds <= 0)
		return null;

	const parsed = [];
	for (const rawToken of input.split(",")) {
		const token = rawToken.trim();
		if (!token)
			continue;
		const chatId = parseSingleChatId(token);
		if (null === chatId)
			return null;
		if (!parsed.includes(chatId)) {
			if (parsed.length >= maxIds)
				return null;
			parsed.push(chatId);
		}
	}

	return parsed.length ? parsed : null;
}

export function telegramChatIdsContain(ids, chatId) {
	return Array.isArray(ids) && 0 !== chatId && ids.includes(chatId);
}

export function resolveTelegramTarget(ids, primaryChatId, requestedChatId) {
	if (0 === requestedChatId)
		return primaryChatId;
	return telegramChatIdsContain(ids, requestedChatId) ? requestedChatId : 0;
}
