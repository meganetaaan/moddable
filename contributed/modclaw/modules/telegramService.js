import {NVS_KEYS} from "./config.js";
import {
	parseTelegramChatIds,
	resolveTelegramTarget,
} from "../core/telegram/chatIds.js";
import {telegramPollTimeoutForBackend} from "../core/telegram/pollPolicy.js";
import {extractTelegramBotId} from "../core/telegram/token.js";
import {extractTelegramMaxUpdateId} from "../core/telegram/update.js";

const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 300000;

function normalizeInteger(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function sanitizeChatIds(chatIds) {
	if (!Array.isArray(chatIds))
		return null;

	const normalized = [];
	for (const id of chatIds) {
		const value = normalizeInteger(id, 0);
		if (!value || normalized.includes(value))
			continue;
		normalized.push(value);
	}

	return normalized.length ? normalized : null;
}

function extractUpdates(responseText) {
	const root = JSON.parse(responseText);
	return Array.isArray(root?.result) ? root.result : [];
}

function buildQuery(params) {
	return Object.entries(params)
		.filter(([, value]) => (undefined !== value) && (null !== value))
		.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
		.join("&");
}

function normalizeTransportResponse(response) {
	if (!response)
		return {ok: false, text: ""};
	if ("string" === typeof response)
		return {ok: true, text: response};
	return {
		ok: response.ok === true,
		text: response.text ?? "",
		status: response.status ?? 0,
	};
}

export class TelegramService {
	constructor(options = {}) {
		this.store = options.store ?? null;
		this.transport = options.transport ?? null;
		this.httpGate = options.httpGate ?? null;
		this.timer = options.timer ?? null;
		this.onMessage = options.onMessage ?? null;
		this.backend = options.backend ?? "openai";
		this.classicEsp32Target = Boolean(options.classicEsp32Target);
		this.token = options.token ?? "";
		this.botId = "";
		this.chatIds = sanitizeChatIds(options.chatIds);
		this.primaryChatId = normalizeInteger(options.primaryChatId, 0);
		this.lastUpdateId = normalizeInteger(options.lastUpdateId, 0);
		this.failureCount = 0;
		this.running = false;
		this.paused = false;
		this.polling = false;
		this.flushOnStart = true;
		this.timerId = 0;
	}

	init() {
		if (!this.token)
			this.token = String(this.store?.get?.(NVS_KEYS.TG_TOKEN) ?? "");
		this.botId = extractTelegramBotId(this.token) ?? "";

		if (!this.chatIds) {
			const chatIdsText = this.store?.get?.(NVS_KEYS.TG_CHAT_IDS);
			this.chatIds = parseTelegramChatIds(chatIdsText) ??
				parseTelegramChatIds(this.store?.get?.(NVS_KEYS.TG_CHAT_ID));
		}

		if (!this.primaryChatId)
			this.primaryChatId = this.chatIds?.[0] ?? 0;
		if (!this.lastUpdateId)
			this.lastUpdateId = normalizeInteger(this.store?.get?.(NVS_KEYS.TG_OFFSET), 0);

		return {
			configured: this.isConfigured(),
			botId: this.botId,
			primaryChatId: this.primaryChatId,
			allowedChatIds: this.chatIds ? this.chatIds.slice() : [],
		};
	}

	isConfigured() {
		return Boolean(this.botId && this.primaryChatId);
	}

	pause() {
		this.paused = true;
		this.#clearTimer();
	}

	resume() {
		this.paused = false;
		if (this.running && !this.polling)
			this.#schedule(0);
	}

	start(options = {}) {
		if (options.onMessage)
			this.onMessage = options.onMessage;
		if (undefined !== options.flushBacklog)
			this.flushOnStart = Boolean(options.flushBacklog);
		else
			this.flushOnStart = true;

		this.init();
		if (!this.isConfigured())
			return false;

		this.running = true;
		if (!this.paused)
			this.#schedule(0);
		return true;
	}

	stop() {
		this.running = false;
		this.#clearTimer();
	}

	#clearTimer() {
		if (this.timerId) {
			this.timer?.clear?.(this.timerId);
			this.timerId = 0;
		}
	}

	#schedule(delayMs) {
		if (!this.running || this.paused || this.timerId)
			return;
		this.timerId = this.timer?.set?.(() => this.#tick(), delayMs) ?? 0;
	}

	async #tick() {
		this.timerId = 0;
		if (!this.running || this.paused || this.polling)
			return;

		this.polling = true;
		let result = {ok: true, skipped: false};
		try {
			if (this.flushOnStart) {
				this.flushOnStart = false;
				result = await this.flushPending();
			}
			else {
				result = await this.pollOnce();
			}
		}
		finally {
			this.polling = false;
		}

		if (!this.running || this.paused)
			return;

		if (!result.ok && !result.skipped)
			this.#schedule(this.#backoffDelayMs());
		else
			this.#schedule(0);
	}

	#backoffDelayMs() {
		const exponent = Math.max(0, this.failureCount - 1);
		return Math.min(BACKOFF_BASE_MS * (2 ** exponent), BACKOFF_MAX_MS);
	}

	#persistOffset() {
		if (this.lastUpdateId > 0)
			this.store?.set?.(NVS_KEYS.TG_OFFSET, String(this.lastUpdateId));
	}

	#buildURL(method, params = null) {
		const query = params ? buildQuery(params) : "";
		return `https://api.telegram.org/bot${this.token}/${method}${query ? `?${query}` : ""}`;
	}

	async #performRequest(owner, request, options = {}) {
		const execute = async () => normalizeTransportResponse(await this.transport.requestText(request));
		const result = this.httpGate
			? await this.httpGate.runExclusive(owner, options, execute)
			: {ok: true, skipped: false, value: await execute()};
		if (!result.ok)
			return {ok: false, skipped: true, text: ""};
		return {...(result.value ?? {ok: false, text: ""}), skipped: false};
	}

	async flushPending() {
		const response = await this.#performRequest("telegram-poll", {
			url: this.#buildURL("getUpdates", {offset: this.lastUpdateId + 1, timeout: 0}),
			method: "GET",
		}, {skipIfBusy: true});

		if (!response.ok) {
			if (!response.skipped)
				this.failureCount++;
			return response;
		}

		this.failureCount = 0;
		const maxUpdateId = extractTelegramMaxUpdateId(response.text);
		if (null !== maxUpdateId) {
			this.lastUpdateId = maxUpdateId;
			this.#persistOffset();
		}
		return {ok: true, skipped: false};
	}

	async pollOnce() {
		const timeoutSeconds = telegramPollTimeoutForBackend(this.backend, this.classicEsp32Target);
		const response = await this.#performRequest("telegram-poll", {
			url: this.#buildURL("getUpdates", {offset: this.lastUpdateId + 1, timeout: timeoutSeconds}),
			method: "GET",
		}, {skipIfBusy: true});

		if (!response.ok) {
			if (!response.skipped)
				this.failureCount++;
			return response;
		}

		this.failureCount = 0;

		let updates;
		try {
			updates = extractUpdates(response.text);
		}
		catch {
			const maxUpdateId = extractTelegramMaxUpdateId(response.text);
			if (null !== maxUpdateId) {
				this.lastUpdateId = maxUpdateId;
				this.#persistOffset();
			}
			this.failureCount++;
			return {ok: false, skipped: false, text: response.text};
		}

		for (const update of updates) {
			const updateId = normalizeInteger(update?.update_id, 0);
			if (updateId > this.lastUpdateId)
				this.lastUpdateId = updateId;

			const text = update?.message?.text;
			const chatId = normalizeInteger(update?.message?.chat?.id, 0);
			if ("string" !== typeof text)
				continue;
			if (!resolveTelegramTarget(this.chatIds, this.primaryChatId, chatId))
				continue;
			await this.onMessage?.(text, {source: "telegram", replyChatId: chatId});
		}

		this.#persistOffset();
		return {ok: true, skipped: false};
	}

	async send(text, requestedChatId = 0) {
		const chatId = resolveTelegramTarget(this.chatIds, this.primaryChatId, requestedChatId);
		if (!this.isConfigured() || !chatId || !this.transport?.requestText)
			return {ok: false, status: 0, text: ""};

		const response = await this.#performRequest("telegram-send", {
			url: this.#buildURL("sendMessage"),
			method: "POST",
			headers: ["Content-Type", "application/json"],
			body: JSON.stringify({chat_id: chatId, text}),
		});

		return response;
	}
}
