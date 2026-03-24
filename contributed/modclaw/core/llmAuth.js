import {
	LLM_API_KEY_MAX_LEN,
	LLM_AUTH_HEADER_BUF_SIZE,
} from "./config.js";

export function copyLLMApiKey(apiKey, maxLength = LLM_API_KEY_MAX_LEN) {
	if (("string" !== typeof apiKey) || !apiKey.length || (apiKey.length > maxLength))
		return null;
	return apiKey;
}

export function buildLLMBearerAuthHeader(apiKey, maxLength = LLM_AUTH_HEADER_BUF_SIZE) {
	const copied = copyLLMApiKey(apiKey);
	if (!copied)
		return null;
	const header = `Bearer ${copied}`;
	return (header.length < maxLength) ? header : null;
}
