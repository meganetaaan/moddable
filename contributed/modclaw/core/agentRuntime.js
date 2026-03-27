import {
	LLM_MAX_RETRIES,
	LLM_RETRY_BASE_MS,
	LLM_RETRY_BUDGET_MS,
	LLM_RETRY_MAX_MS,
	MESSAGE_REPLAY_COOLDOWN_MS,
	START_COMMAND_COOLDOWN_MS,
	MAX_TOOL_ROUNDS,
} from "./config.js";
import {
	isCommand,
	isSlashCommand,
	parseDiagCommandArgs,
	parseGPIOCommandArgs,
} from "./commands.js";
import {ConversationHistory} from "./agentHistory.js";
import {settingsText, startHelpText} from "./agentResponses.js";
import {buildSystemPrompt, loadCurrentPersona} from "./persona.js";

function noop() {
}

function normalizeInteger(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function isCronTriggerMessage(text) {
	let value = String(text ?? "");
	while (value.length && /\s/.test(value[0]))
		value = value.slice(1);
	return value.startsWith("[CRON ");
}

function normalizeRateLimitResult(result) {
	if (result === true)
		return {ok: true, reason: ""};
	if (result === false)
		return {ok: false, reason: "Rate limited"};
	if (!result)
		return {ok: true, reason: ""};
	return {ok: result.ok !== false, reason: result.reason ?? ""};
}

function normalizeToolResult(result) {
	if (!result)
		return {ok: false, text: ""};
	if ("string" === typeof result)
		return {ok: true, text: result};
	return {ok: result.ok !== false, text: result.text ?? ""};
}

function normalizeReplyTarget(source, options = {}) {
	const replyTarget = options.replyTarget;
	if (replyTarget && ("object" === typeof replyTarget)) {
		const transport = String(replyTarget.transport ?? source ?? "telegram");
		if ("slack" === transport) {
			const conversationId = String(replyTarget.conversationId ?? replyTarget.channelId ?? "");
			if (!conversationId)
				return null;
			return {
				transport: "slack",
				conversationId,
				userId: String(replyTarget.userId ?? ""),
			};
		}

		const chatId = normalizeInteger(
			replyTarget.chatId ?? replyTarget.replyChatId ?? replyTarget.conversationId ?? options.replyChatId,
			0
		);
		if (!chatId)
			return null;
		return {
			transport: "telegram",
			chatId,
		};
	}

	const replyChatId = normalizeInteger(options.replyChatId, 0);
	if (replyChatId || ("telegram" === source)) {
		if (!replyChatId)
			return null;
		return {
			transport: "telegram",
			chatId: replyChatId,
		};
	}

	const replyConversationId = String(options.replyConversationId ?? options.conversationId ?? "");
	if (("slack" === source) || replyConversationId) {
		if (!replyConversationId)
			return null;
		return {
			transport: "slack",
			conversationId: replyConversationId,
			userId: String(options.replyUserId ?? options.userId ?? ""),
		};
	}

	return null;
}

export class AgentRuntime {
	constructor(options = {}) {
		this.clock = options.clock ?? {nowMs: () => Date.now(), sleepMs: noop};
		this.llm = options.llm ?? {request: () => ({ok: false, responseText: ""})};
		this.tools = options.tools ?? {};
		this.rateLimit = options.rateLimit ?? {check: () => ({ok: true, reason: ""}), recordRequest: noop};
		this.personaStore = options.personaStore ?? null;
		this.localAdmin = options.localAdmin ?? null;
		this.remoteControl = options.remoteControl ?? options.telegramControl ?? {pausePolling: noop, resumePolling: noop};
		this.transportStatus = options.transportStatus ?? (() => ({}));
		this.outputs = options.outputs ?? {sendChannel: noop, sendRemote: noop, sendTelegram: noop, sendSlack: noop};
		this.requestCodec = options.requestCodec ?? {
			buildRequest({systemPrompt, history, tools}) {
				return JSON.stringify({systemPrompt, history, tools});
			},
			parseResponse(responseText) {
				return JSON.parse(responseText);
			},
		};
		this.maxToolRounds = options.maxToolRounds ?? MAX_TOOL_ROUNDS;
		this.retryPolicy = {
			maxRetries: options.retryPolicy?.maxRetries ?? LLM_MAX_RETRIES,
			baseDelayMs: options.retryPolicy?.baseDelayMs ?? LLM_RETRY_BASE_MS,
			maxDelayMs: options.retryPolicy?.maxDelayMs ?? LLM_RETRY_MAX_MS,
			budgetMs: options.retryPolicy?.budgetMs ?? LLM_RETRY_BUDGET_MS,
		};
		this.history = new ConversationHistory;
		this.reset();
	}

	reset() {
		this.history.reset();
		this.persona = loadCurrentPersona(this.personaStore);
		this.messagesPaused = false;
		this.lastStartResponseMs = 0;
		this.lastNonCommandText = "";
		this.lastNonCommandResponseMs = 0;
	}

	#sendRemoteResponse(text, replyTarget) {
		if (!replyTarget)
			return;
		if (this.outputs.sendRemote)
			return this.outputs.sendRemote(text, replyTarget);
		if ("slack" === replyTarget.transport)
			return this.outputs.sendSlack?.(text, replyTarget.conversationId, replyTarget);
		return this.outputs.sendTelegram?.(text, replyTarget.chatId ?? 0, replyTarget);
	}

	async #sendRemoteResponseAsync(text, replyTarget) {
		if (!replyTarget)
			return;
		if (this.outputs.sendRemote) {
			await this.outputs.sendRemote(text, replyTarget);
			return;
		}
		if ("slack" === replyTarget.transport) {
			await this.outputs.sendSlack?.(text, replyTarget.conversationId, replyTarget);
			return;
		}
		await this.outputs.sendTelegram?.(text, replyTarget.chatId ?? 0, replyTarget);
	}

	#sendResponse(text, replyTarget) {
		this.outputs.sendChannel?.(text);
		this.#sendRemoteResponse(text, replyTarget);
	}

	async #sendResponseAsync(text, replyTarget) {
		await this.outputs.sendChannel?.(text);
		await this.#sendRemoteResponseAsync(text, replyTarget);
	}

	#settingsText() {
		return settingsText({
			paused: this.messagesPaused,
			persona: this.persona,
			...(this.transportStatus?.() ?? {}),
		});
	}

	#isLocalAdminCommand(text) {
		return isCommand(text, "gpio") ||
			isCommand(text, "diag") ||
			Boolean(this.localAdmin?.isCommand?.(text));
	}

	#updateSuccessfulReplayState(userMessage) {
		this.lastNonCommandText = userMessage;
		this.lastNonCommandResponseMs = this.clock.nowMs();
	}

	#executeBuiltinTool(toolName, toolInput) {
		const result = normalizeToolResult(this.tools.execute?.(toolName, toolInput));
		if (result.ok && toolName === "set_persona") {
			const persona = toolInput?.persona;
			if ("string" === typeof persona)
				this.persona = persona.toLowerCase();
		}
		else if (result.ok && toolName === "reset_persona") {
			this.persona = "neutral";
		}
		return result.text || `Error: ${toolName} failed`;
	}

	#handleLocalAdmin(text, source, replyTarget) {
		if ("channel" !== source) {
			this.#sendResponse("Error: local admin commands are only available on the USB serial console.", replyTarget);
			return;
		}

		if (isCommand(text, "diag")) {
			try {
				const input = parseDiagCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.("get_diagnostics", input));
				this.#sendResponse(result.text || "Error: diagnostics failed", replyTarget);
			}
			catch (error) {
				this.#sendResponse(error.message, replyTarget);
			}
			return;
		}

		if (isCommand(text, "gpio")) {
			try {
				const parsed = parseGPIOCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.(parsed.toolName, parsed.input));
				this.#sendResponse(result.text || "Error: GPIO read failed", replyTarget);
			}
			catch (error) {
				this.#sendResponse(error.message, replyTarget);
			}
			return;
		}

		const response = this.localAdmin.handle(text);
		this.#sendResponse(response.text, replyTarget);
		if (response.ok)
			this.localAdmin.performAction?.(response.action);
	}

	async #handleLocalAdminAsync(text, source, replyTarget) {
		if ("channel" !== source) {
			await this.#sendResponseAsync("Error: local admin commands are only available on the USB serial console.", replyTarget);
			return;
		}

		if (isCommand(text, "diag")) {
			try {
				const input = parseDiagCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.("get_diagnostics", input));
				await this.#sendResponseAsync(result.text || "Error: diagnostics failed", replyTarget);
			}
			catch (error) {
				await this.#sendResponseAsync(error.message, replyTarget);
			}
			return;
		}

		if (isCommand(text, "gpio")) {
			try {
				const parsed = parseGPIOCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.(parsed.toolName, parsed.input));
				await this.#sendResponseAsync(result.text || "Error: GPIO read failed", replyTarget);
			}
			catch (error) {
				await this.#sendResponseAsync(error.message, replyTarget);
			}
			return;
		}

		const response = this.localAdmin.handleAsync
			? await this.localAdmin.handleAsync(text)
			: this.localAdmin.handle(text);
		await this.#sendResponseAsync(response.text, replyTarget);
		if (response.ok)
			await this.localAdmin.performAction?.(response.action);
	}

	#requestWithRetry(request) {
		let delayMs = this.retryPolicy.baseDelayMs;
		const retryStartedMs = this.clock.nowMs();

		for (let retry = 0; retry < this.retryPolicy.maxRetries; retry++) {
			const response = this.llm.request(request);
			if (response?.ok)
				return response;

			if (retry === this.retryPolicy.maxRetries - 1)
				break;

			const elapsedMs = this.clock.nowMs() - retryStartedMs;
			if (elapsedMs >= this.retryPolicy.budgetMs)
				break;

			const remainingBudgetMs = this.retryPolicy.budgetMs - elapsedMs;
			const sleepMs = Math.min(delayMs, remainingBudgetMs);
			if (sleepMs <= 0)
				break;

			this.clock.sleepMs?.(sleepMs);
			delayMs = Math.min(delayMs * 2, this.retryPolicy.maxDelayMs);
		}

		return {ok: false, responseText: ""};
	}

	async #requestWithRetryAsync(request) {
		let delayMs = this.retryPolicy.baseDelayMs;
		const retryStartedMs = this.clock.nowMs();

		for (let retry = 0; retry < this.retryPolicy.maxRetries; retry++) {
			const response = await this.llm.request(request);
			if (response?.ok)
				return response;

			if (retry === this.retryPolicy.maxRetries - 1)
				break;

			const elapsedMs = this.clock.nowMs() - retryStartedMs;
			if (elapsedMs >= this.retryPolicy.budgetMs)
				break;

			const remainingBudgetMs = this.retryPolicy.budgetMs - elapsedMs;
			const sleepMs = Math.min(delayMs, remainingBudgetMs);
			if (sleepMs <= 0)
				break;

			await this.clock.sleepMs?.(sleepMs);
			delayMs = Math.min(delayMs * 2, this.retryPolicy.maxDelayMs);
		}

		return {ok: false, responseText: ""};
	}

	processMessage(text, options = {}) {
		const userMessage = String(text ?? "");
		const source = options.source ?? "channel";
		const replyTarget = normalizeReplyTarget(source, options);
		const isNonCommandMessage = !isSlashCommand(userMessage);
		const isCronTrigger = isCronTriggerMessage(userMessage);

		if (isCommand(userMessage, "resume")) {
			if (!this.messagesPaused) {
				this.#sendResponse("zclaw is already active.", replyTarget);
				return;
			}
			this.messagesPaused = false;
			this.#sendResponse("zclaw resumed. Send /start for command help.", replyTarget);
			return;
		}

		if (isCommand(userMessage, "settings")) {
			this.#sendResponse(this.#settingsText(), replyTarget);
			return;
		}

		if (this.#isLocalAdminCommand(userMessage)) {
			this.#handleLocalAdmin(userMessage, source, replyTarget);
			return;
		}

		if (this.messagesPaused)
			return;

		if (isCommand(userMessage, "help")) {
			this.#sendResponse(startHelpText(), replyTarget);
			return;
		}

		if (isCommand(userMessage, "stop")) {
			this.messagesPaused = true;
			this.#sendResponse("zclaw paused. I will ignore new messages until /resume.", replyTarget);
			return;
		}

		if (isCommand(userMessage, "start")) {
			const nowMs = this.clock.nowMs();
			if (this.lastStartResponseMs && ((nowMs - this.lastStartResponseMs) < START_COMMAND_COOLDOWN_MS))
				return;
			this.lastStartResponseMs = nowMs;
			this.#sendResponse(startHelpText(), replyTarget);
			return;
		}

		if (isNonCommandMessage &&
			this.lastNonCommandText &&
			this.lastNonCommandText === userMessage &&
			this.lastNonCommandResponseMs &&
			((this.clock.nowMs() - this.lastNonCommandResponseMs) < MESSAGE_REPLAY_COOLDOWN_MS)) {
			return;
		}

		const marker = this.history.mark();
		this.remoteControl.pausePolling?.();
		try {
			this.history.addUser(userMessage);

			for (let rounds = 0; rounds < this.maxToolRounds; rounds++) {
				let request;
				try {
					request = this.requestCodec.buildRequest({
						systemPrompt: buildSystemPrompt({persona: this.persona}),
						history: this.history.snapshot(),
						tools: this.tools.list?.() ?? [],
					});
				}
				catch {
					this.history.rollback(marker);
					this.#sendResponse("Error: Failed to build request", replyTarget);
					return;
				}

				const rateResult = normalizeRateLimitResult(this.rateLimit.check?.());
				if (!rateResult.ok) {
					this.history.rollback(marker);
					this.#sendResponse(rateResult.reason, replyTarget);
					return;
				}

				const llmResponse = this.#requestWithRetry(request);
				if (!llmResponse.ok) {
					this.history.rollback(marker);
					this.#sendResponse("Error: Failed to contact LLM API after retries", replyTarget);
					return;
				}

				this.rateLimit.recordRequest?.();

				let parsed;
				try {
					parsed = this.requestCodec.parseResponse(llmResponse.responseText);
				}
				catch {
					this.history.rollback(marker);
					this.#sendResponse("Error: Failed to parse LLM response", replyTarget);
					return;
				}

				if (parsed.toolName && parsed.toolId) {
					this.history.addToolUse({
						toolId: parsed.toolId,
						toolName: parsed.toolName,
						input: parsed.toolInput ?? {},
					});

					let toolResultText = "";
					const userTool = this.tools.findUserTool?.(parsed.toolName) ?? null;
					if (userTool) {
						toolResultText = `Execute this action now: ${userTool.action}`;
					}
					else if (isCronTrigger && (parsed.toolName === "cron_set")) {
						toolResultText =
							"Error: cron_set is not allowed during scheduled task execution. " +
							"Execute the scheduled action now instead of creating a new schedule.";
					}
					else {
						toolResultText = this.#executeBuiltinTool(parsed.toolName, parsed.toolInput ?? {});
					}

					this.history.addToolResult({toolId: parsed.toolId, text: toolResultText});
					continue;
				}

				const responseText = parsed.text || "(No response from Claude)";
				this.history.addAssistant(responseText);
				this.#sendResponse(responseText, replyTarget);
				if (isNonCommandMessage)
					this.#updateSuccessfulReplayState(userMessage);
				return;
			}

			this.history.addAssistant("(Reached max tool iterations)");
			this.#sendResponse("(Reached max tool iterations)", replyTarget);
		}
		finally {
			this.remoteControl.resumePolling?.();
		}
	}

	async processMessageAsync(text, options = {}) {
		const userMessage = String(text ?? "");
		const source = options.source ?? "channel";
		const replyTarget = normalizeReplyTarget(source, options);
		const isNonCommandMessage = !isSlashCommand(userMessage);
		const isCronTrigger = isCronTriggerMessage(userMessage);

		if (isCommand(userMessage, "resume")) {
			if (!this.messagesPaused) {
				await this.#sendResponseAsync("zclaw is already active.", replyTarget);
				return;
			}
			this.messagesPaused = false;
			await this.#sendResponseAsync("zclaw resumed. Send /start for command help.", replyTarget);
			return;
		}

		if (isCommand(userMessage, "settings")) {
			await this.#sendResponseAsync(this.#settingsText(), replyTarget);
			return;
		}

		if (this.#isLocalAdminCommand(userMessage)) {
			await this.#handleLocalAdminAsync(userMessage, source, replyTarget);
			return;
		}

		if (this.messagesPaused)
			return;

		if (isCommand(userMessage, "help")) {
			await this.#sendResponseAsync(startHelpText(), replyTarget);
			return;
		}

		if (isCommand(userMessage, "stop")) {
			this.messagesPaused = true;
			await this.#sendResponseAsync("zclaw paused. I will ignore new messages until /resume.", replyTarget);
			return;
		}

		if (isCommand(userMessage, "start")) {
			const nowMs = this.clock.nowMs();
			if (this.lastStartResponseMs && ((nowMs - this.lastStartResponseMs) < START_COMMAND_COOLDOWN_MS))
				return;
			this.lastStartResponseMs = nowMs;
			await this.#sendResponseAsync(startHelpText(), replyTarget);
			return;
		}

		if (isNonCommandMessage &&
			this.lastNonCommandText &&
			this.lastNonCommandText === userMessage &&
			this.lastNonCommandResponseMs &&
			((this.clock.nowMs() - this.lastNonCommandResponseMs) < MESSAGE_REPLAY_COOLDOWN_MS)) {
			return;
		}

		const marker = this.history.mark();
		await this.remoteControl.pausePolling?.();
		try {
			this.history.addUser(userMessage);

			for (let rounds = 0; rounds < this.maxToolRounds; rounds++) {
				let request;
				try {
					request = this.requestCodec.buildRequest({
						systemPrompt: buildSystemPrompt({persona: this.persona}),
						history: this.history.snapshot(),
						tools: this.tools.list?.() ?? [],
					});
				}
				catch {
					this.history.rollback(marker);
					await this.#sendResponseAsync("Error: Failed to build request", replyTarget);
					return;
				}

				const rateResult = normalizeRateLimitResult(this.rateLimit.check?.());
				if (!rateResult.ok) {
					this.history.rollback(marker);
					await this.#sendResponseAsync(rateResult.reason, replyTarget);
					return;
				}

				const llmResponse = await this.#requestWithRetryAsync(request);
				if (!llmResponse.ok) {
					this.history.rollback(marker);
					await this.#sendResponseAsync("Error: Failed to contact LLM API after retries", replyTarget);
					return;
				}

				this.rateLimit.recordRequest?.();

				let parsed;
				try {
					parsed = this.requestCodec.parseResponse(llmResponse.responseText);
				}
				catch {
					this.history.rollback(marker);
					await this.#sendResponseAsync("Error: Failed to parse LLM response", replyTarget);
					return;
				}

				if (parsed.toolName && parsed.toolId) {
					this.history.addToolUse({
						toolId: parsed.toolId,
						toolName: parsed.toolName,
						input: parsed.toolInput ?? {},
					});

					let toolResultText = "";
					const userTool = this.tools.findUserTool?.(parsed.toolName) ?? null;
					if (userTool) {
						toolResultText = `Execute this action now: ${userTool.action}`;
					}
					else if (isCronTrigger && (parsed.toolName === "cron_set")) {
						toolResultText =
							"Error: cron_set is not allowed during scheduled task execution. " +
							"Execute the scheduled action now instead of creating a new schedule.";
					}
					else {
						toolResultText = this.#executeBuiltinTool(parsed.toolName, parsed.toolInput ?? {});
					}

					this.history.addToolResult({toolId: parsed.toolId, text: toolResultText});
					continue;
				}

				const responseText = parsed.text || "(No response from Claude)";
				this.history.addAssistant(responseText);
				await this.#sendResponseAsync(responseText, replyTarget);
				if (isNonCommandMessage)
					this.#updateSuccessfulReplayState(userMessage);
				return;
			}

			this.history.addAssistant("(Reached max tool iterations)");
			await this.#sendResponseAsync("(Reached max tool iterations)", replyTarget);
		}
		finally {
			await this.remoteControl.resumePolling?.();
		}
	}
}
