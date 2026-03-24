import {
	BACKENDS,
	TELEGRAM_POLL_TIMEOUT,
	TELEGRAM_POLL_TIMEOUT_ESP32,
	TELEGRAM_POLL_TIMEOUT_OPENROUTER,
} from "../config.js";

export function telegramPollTimeoutForBackend(backend, classicEsp32Target = false) {
	let timeout = TELEGRAM_POLL_TIMEOUT;

	if (backend === BACKENDS.OPENROUTER && TELEGRAM_POLL_TIMEOUT_OPENROUTER < timeout)
		timeout = TELEGRAM_POLL_TIMEOUT_OPENROUTER;

	if (classicEsp32Target && TELEGRAM_POLL_TIMEOUT_ESP32 < timeout)
		timeout = TELEGRAM_POLL_TIMEOUT_ESP32;

	return timeout;
}
