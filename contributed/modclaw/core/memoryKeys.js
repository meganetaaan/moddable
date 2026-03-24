import {USER_MEMORY_KEY_PREFIX} from "./config.js";
import {NVS_KEYS} from "./nvsKeys.js";

const SENSITIVE_KEYS = new Set([
	NVS_KEYS.API_KEY,
	NVS_KEYS.TG_TOKEN,
	NVS_KEYS.TG_CHAT_ID,
	NVS_KEYS.TG_CHAT_IDS,
	NVS_KEYS.WIFI_PASS,
	NVS_KEYS.LLM_BACKEND,
	NVS_KEYS.LLM_MODEL,
	NVS_KEYS.LLM_API_URL,
	NVS_KEYS.WIFI_SSID,
]);

export function isUserMemoryKey(key) {
	return Boolean(key) && key.startsWith(USER_MEMORY_KEY_PREFIX);
}

export function isSensitiveMemoryKey(key) {
	return Boolean(key) && SENSITIVE_KEYS.has(key);
}
