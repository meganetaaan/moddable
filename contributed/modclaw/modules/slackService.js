import {NVS_KEYS} from "./config.js";
import {isDebugTraceEnabled, traceDebug} from "./debug.js";
import {
	parseSlackUserIds,
	slackUserIdsContain,
} from "../core/slack/userIds.js";

const SLACK_API_BASE = "https://slack.com/api";
const POLL_INTERVAL_MS = 5000;
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 300000;

function traceSlack(message) {
	trace(`zclaw slack ${message}\n`);
}

function traceSlackError(owner, error) {
	traceSlack(`${owner} error=${error}`);
	if (error?.stack)
		trace(`${error.stack}\n`);
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

function buildQuery(params) {
	return Object.entries(params)
		.filter(([, value]) => (undefined !== value) && (null !== value) && ("" !== value))
		.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
		.join("&");
}

function isSlackTs(value) {
	return ("string" === typeof value) && /^\d+\.\d+$/.test(value);
}

function compareSlackTs(left, right) {
	if (left === right)
		return 0;
	const [leftWhole = "0", leftFraction = "0"] = String(left).split(".");
	const [rightWhole = "0", rightFraction = "0"] = String(right).split(".");
	if (leftWhole.length !== rightWhole.length)
		return leftWhole.length - rightWhole.length;
	if (leftWhole !== rightWhole)
		return leftWhole < rightWhole ? -1 : 1;
	const normalizedLeft = leftFraction.padEnd(6, "0");
	const normalizedRight = rightFraction.padEnd(6, "0");
	return normalizedLeft < normalizedRight ? -1 : 1;
}

function parseSlackRoot(responseText) {
	try {
		return JSON.parse(responseText);
	}
	catch {
		return null;
	}
}

function parseSlackState(value) {
	if ("string" !== typeof value || !value.length)
		return {cursorByChannelId: {}};
	try {
		const parsed = JSON.parse(value);
		const cursorByChannelId = {};
		for (const [channelId, ts] of Object.entries(parsed?.cursorByChannelId ?? {})) {
			if (isSlackTs(ts))
				cursorByChannelId[channelId] = ts;
		}
		return {cursorByChannelId};
	}
	catch {
		return {cursorByChannelId: {}};
	}
}

function sanitizeAllowedUserIds(value) {
	if (Array.isArray(value)) {
		const joined = value.map(item => String(item ?? "").trim().toUpperCase()).join(",");
		return parseSlackUserIds(joined);
	}
	return parseSlackUserIds(value);
}

export class SlackService {
	constructor(options = {}) {
		this.store = options.store ?? null;
		this.transport = options.transport ?? null;
		this.httpGate = options.httpGate ?? null;
		this.timer = options.timer ?? null;
		this.onMessage = options.onMessage ?? null;
		this.token = options.token ?? "";
		this.allowedUserIds = sanitizeAllowedUserIds(options.allowedUserIds) ?? null;
		this.cursorByChannelId = {};
		this.channelByUserId = {};
		this.failureCount = 0;
		this.running = false;
		this.paused = false;
		this.polling = false;
		this.flushOnStart = true;
		this.timerId = 0;
	}

	init() {
		if (!this.token)
			this.token = String(this.store?.get?.(NVS_KEYS.SLACK_TOKEN) ?? "");
		if (!this.allowedUserIds)
			this.allowedUserIds = parseSlackUserIds(this.store?.get?.(NVS_KEYS.SLACK_USER_IDS)) ?? null;

		const state = parseSlackState(this.store?.get?.(NVS_KEYS.SLACK_STATE));
		this.cursorByChannelId = state.cursorByChannelId;

		return {
			configured: this.isConfigured(),
			allowedUserIds: this.allowedUserIds ? this.allowedUserIds.slice() : [],
		};
	}

	isConfigured() {
		return Boolean(this.token && this.allowedUserIds?.length);
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
		traceSlack(`start allowed_users=${this.allowedUserIds?.length ?? 0}`);
		if (!this.paused)
			this.#schedule(0);
		return true;
	}

	stop() {
		this.running = false;
		this.#clearTimer();
	}

	async send(text, conversationId = "") {
		if (("string" !== typeof text) || !text.length || !this.transport?.requestText)
			return {ok: false, text: ""};

		if (!this.isConfigured())
			return {ok: false, text: ""};

		let targetConversationId = conversationId;
		if (!targetConversationId) {
			await this.#refreshChannels();
			const primaryUserId = this.allowedUserIds?.[0];
			targetConversationId = primaryUserId ? this.channelByUserId[primaryUserId] : "";
		}
		if (!targetConversationId)
			return {ok: false, text: ""};

		return await this.#performSlackRequest("slack-send", {
			url: `${SLACK_API_BASE}/chat.postMessage`,
			method: "POST",
			headers: [
				"Authorization", `Bearer ${this.token}`,
				"Content-Type", "application/json; charset=utf-8",
			],
			body: JSON.stringify({
				channel: targetConversationId,
				text,
			}),
		}, {skipIfBusy: false});
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
		this.timerId = this.timer?.set?.(() => {
			return this.#tick().catch(error => {
				traceSlackError("tick_error", error);
				this.polling = false;
				if (this.running && !this.paused) {
					this.failureCount++;
					this.#schedule(this.#backoffDelayMs());
				}
			});
		}, delayMs) ?? 0;
	}

	#backoffDelayMs() {
		const exponent = Math.max(0, this.failureCount - 1);
		return Math.min(BACKOFF_BASE_MS * (2 ** exponent), BACKOFF_MAX_MS);
	}

	#persistState() {
		this.store?.set?.(NVS_KEYS.SLACK_STATE, JSON.stringify({
			cursorByChannelId: this.cursorByChannelId,
		}));
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
			this.#schedule(POLL_INTERVAL_MS);
	}

	async #performSlackRequest(owner, request, options = {}) {
		traceDebug("slack", `request owner=${owner} url=${request?.url ?? ""}`);
		const execute = async () => normalizeTransportResponse(await this.transport.requestText(request));
		const result = this.httpGate
			? await this.httpGate.runExclusive(owner, options, execute)
			: {ok: true, skipped: false, value: await execute()};
		if (!result.ok)
			return {ok: false, skipped: true, text: "", root: null};

		const response = result.value ?? {ok: false, text: ""};
		if (!response.ok) {
			traceSlack(`http_error owner=${owner} status=${response.status ?? 0}`);
			return {ok: false, skipped: false, text: response.text ?? "", root: null};
		}

		const root = parseSlackRoot(response.text);
		if (!root?.ok) {
			traceSlack(`api_error owner=${owner} error=${root?.error ?? "invalid_response"}`);
			return {ok: false, skipped: false, text: response.text ?? "", root};
		}
		if (isDebugTraceEnabled("slack"))
			traceDebug("slack", `response owner=${owner} status=${response.status ?? 0}`);
		return {ok: true, skipped: false, text: response.text ?? "", root};
	}

	async #refreshChannels() {
		const found = {};
		let cursor = "";

		do {
			const query = buildQuery({
				types: "im",
				exclude_archived: true,
				limit: 200,
				cursor,
			});
			const response = await this.#performSlackRequest("slack-list", {
				url: `${SLACK_API_BASE}/conversations.list${query ? `?${query}` : ""}`,
				method: "GET",
				headers: [
					"Authorization", `Bearer ${this.token}`,
				],
			}, {skipIfBusy: true});
			if (!response.ok)
				return response;

			for (const channel of response.root?.channels ?? []) {
				const userId = String(channel?.user ?? "").toUpperCase();
				const channelId = String(channel?.id ?? "");
				if (!channel?.is_im || !channelId || !slackUserIdsContain(this.allowedUserIds, userId))
					continue;
				found[userId] = channelId;
			}

			cursor = String(response.root?.response_metadata?.next_cursor ?? "");
		} while (cursor && (Object.keys(found).length < (this.allowedUserIds?.length ?? 0)));

		this.channelByUserId = found;
		if (!Object.keys(found).length)
			traceSlack("dm_missing allowed_user_channels=0");
		return {ok: true, skipped: false};
	}

	async flushPending() {
		const refresh = await this.#refreshChannels();
		if (!refresh.ok)
			return refresh;

		let changed = false;
		for (const userId of this.allowedUserIds ?? []) {
			const channelId = this.channelByUserId[userId];
			if (!channelId)
				continue;

			const query = buildQuery({
				channel: channelId,
				limit: 1,
			});
			const response = await this.#performSlackRequest("slack-history", {
				url: `${SLACK_API_BASE}/conversations.history?${query}`,
				method: "GET",
				headers: [
					"Authorization", `Bearer ${this.token}`,
				],
			}, {skipIfBusy: true});
			if (!response.ok) {
				if (!response.skipped)
					this.failureCount++;
				return response;
			}

			const latestTs = response.root?.messages?.[0]?.ts;
			if (isSlackTs(latestTs)) {
				this.cursorByChannelId[channelId] = latestTs;
				changed = true;
			}
		}

		if (changed)
			this.#persistState();
		this.failureCount = 0;
		return {ok: true, skipped: false};
	}

	async pollOnce() {
		const refresh = await this.#refreshChannels();
		if (!refresh.ok) {
			if (!refresh.skipped)
				this.failureCount++;
			return refresh;
		}

		for (const userId of this.allowedUserIds ?? []) {
			const channelId = this.channelByUserId[userId];
			if (!channelId)
				continue;

			const cursor = this.cursorByChannelId[channelId] ?? "";
			if (!cursor) {
				const flushed = await this.flushPending();
				if (!flushed.ok)
					return flushed;
				continue;
			}

			const query = buildQuery({
				channel: channelId,
				oldest: cursor,
				inclusive: false,
				limit: 20,
			});
			const response = await this.#performSlackRequest("slack-history", {
				url: `${SLACK_API_BASE}/conversations.history?${query}`,
				method: "GET",
				headers: [
					"Authorization", `Bearer ${this.token}`,
				],
			}, {skipIfBusy: true});
			if (!response.ok) {
				if (!response.skipped)
					this.failureCount++;
				return response;
			}

			const messages = (response.root?.messages ?? [])
				.filter(message => {
					const ts = message?.ts;
					return isSlackTs(ts) &&
						("message" === message?.type) &&
						!message?.subtype &&
						!message?.bot_id &&
						("string" === typeof message?.text) &&
						message.text.length &&
						slackUserIdsContain(this.allowedUserIds, message?.user);
				})
				.sort((left, right) => compareSlackTs(left.ts, right.ts));

			for (const message of messages) {
				this.cursorByChannelId[channelId] = message.ts;
				this.#persistState();
				traceSlack(`inbound user=${userId} channel=${channelId}`);
				await this.onMessage?.(message.text, {
					source: "slack",
					replyTarget: {
						transport: "slack",
						conversationId: channelId,
						userId,
					},
				});
			}
		}

		this.failureCount = 0;
		return {ok: true, skipped: false};
	}
}
