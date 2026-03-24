import {
	parseTelegramChatIds,
	resolveTelegramTarget,
	telegramChatIdsContain,
} from "../core/telegram/chatIds.js";
import {telegramPollTimeoutForBackend} from "../core/telegram/pollPolicy.js";
import {extractTelegramBotId} from "../core/telegram/token.js";
import {extractTelegramMaxUpdateId} from "../core/telegram/update.js";

export function extractBotId(token, maxLength = 24) {
	const botId = extractTelegramBotId(token);
	if (!botId)
		return null;
	return ((botId.length + 1) <= maxLength) ? botId : null;
}

export function parseChatIds(input, maxIds) {
	return parseTelegramChatIds(input, maxIds);
}

export function containsChatId(ids, chatId) {
	return telegramChatIdsContain(ids, chatId);
}

export function resolveTargetChatId(ids, primaryChatId, requestedChatId) {
	return resolveTelegramTarget(ids, primaryChatId, requestedChatId);
}

export function pollTimeoutForBackend(backend, options = {}) {
	return telegramPollTimeoutForBackend(backend, Boolean(options.classicEsp32Target));
}

export function extractMaxUpdateId(buffer) {
	return extractTelegramMaxUpdateId(buffer);
}
