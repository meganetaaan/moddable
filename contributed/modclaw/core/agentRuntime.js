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

export class AgentRuntime {
	constructor(options = {}) {
		this.clock = options.clock ?? {nowMs: () => Date.now(), sleepMs: noop};
		this.llm = options.llm ?? {request: () => ({ok: false, responseText: ""})};
		this.tools = options.tools ?? {};
		this.rateLimit = options.rateLimit ?? {check: () => ({ok: true, reason: ""}), recordRequest: noop};
		this.personaStore = options.personaStore ?? null;
		this.localAdmin = options.localAdmin ?? null;
		this.telegramControl = options.telegramControl ?? {pausePolling: noop, resumePolling: noop};
		this.outputs = options.outputs ?? {sendChannel: noop, sendTelegram: noop};
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

	#sendResponse(text, replyChatId) {
		this.outputs.sendChannel?.(text);
		this.outputs.sendTelegram?.(text, replyChatId);
	}

	async #sendResponseAsync(text, replyChatId) {
		await this.outputs.sendChannel?.(text);
		await this.outputs.sendTelegram?.(text, replyChatId);
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

	#handleLocalAdmin(text, source, replyChatId) {
		if ("channel" !== source) {
			this.#sendResponse("Error: local admin commands are only available on the USB serial console.", replyChatId);
			return;
		}

		if (isCommand(text, "diag")) {
			try {
				const input = parseDiagCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.("get_diagnostics", input));
				this.#sendResponse(result.text || "Error: diagnostics failed", replyChatId);
			}
			catch (error) {
				this.#sendResponse(error.message, replyChatId);
			}
			return;
		}

		if (isCommand(text, "gpio")) {
			try {
				const parsed = parseGPIOCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.(parsed.toolName, parsed.input));
				this.#sendResponse(result.text || "Error: GPIO read failed", replyChatId);
			}
			catch (error) {
				this.#sendResponse(error.message, replyChatId);
			}
			return;
		}

		const response = this.localAdmin.handle(text);
		this.#sendResponse(response.text, replyChatId);
		if (response.ok)
			this.localAdmin.performAction?.(response.action);
	}

	async #handleLocalAdminAsync(text, source, replyChatId) {
		if ("channel" !== source) {
			await this.#sendResponseAsync("Error: local admin commands are only available on the USB serial console.", replyChatId);
			return;
		}

		if (isCommand(text, "diag")) {
			try {
				const input = parseDiagCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.("get_diagnostics", input));
				await this.#sendResponseAsync(result.text || "Error: diagnostics failed", replyChatId);
			}
			catch (error) {
				await this.#sendResponseAsync(error.message, replyChatId);
			}
			return;
		}

		if (isCommand(text, "gpio")) {
			try {
				const parsed = parseGPIOCommandArgs(text);
				const result = normalizeToolResult(this.tools.execute?.(parsed.toolName, parsed.input));
				await this.#sendResponseAsync(result.text || "Error: GPIO read failed", replyChatId);
			}
			catch (error) {
				await this.#sendResponseAsync(error.message, replyChatId);
			}
			return;
		}

		const response = this.localAdmin.handleAsync
			? await this.localAdmin.handleAsync(text)
			: this.localAdmin.handle(text);
		await this.#sendResponseAsync(response.text, replyChatId);
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
		const replyChatId = options.replyChatId ?? 0;
		const isNonCommandMessage = !isSlashCommand(userMessage);
		const isCronTrigger = isCronTriggerMessage(userMessage);

		if (isCommand(userMessage, "resume")) {
			if (!this.messagesPaused) {
				this.#sendResponse("zclaw is already active.", replyChatId);
				return;
			}
			this.messagesPaused = false;
			this.#sendResponse("zclaw resumed. Send /start for command help.", replyChatId);
			return;
		}

		if (isCommand(userMessage, "settings")) {
			this.#sendResponse(settingsText({paused: this.messagesPaused, persona: this.persona}), replyChatId);
			return;
		}

		if (this.#isLocalAdminCommand(userMessage)) {
			this.#handleLocalAdmin(userMessage, source, replyChatId);
			return;
		}

		if (this.messagesPaused)
			return;

		if (isCommand(userMessage, "help")) {
			this.#sendResponse(startHelpText(), replyChatId);
			return;
		}

		if (isCommand(userMessage, "stop")) {
			this.messagesPaused = true;
			this.#sendResponse("zclaw paused. I will ignore new messages until /resume.", replyChatId);
			return;
		}

		if (isCommand(userMessage, "start")) {
			const nowMs = this.clock.nowMs();
			if (this.lastStartResponseMs && ((nowMs - this.lastStartResponseMs) < START_COMMAND_COOLDOWN_MS))
				return;
			this.lastStartResponseMs = nowMs;
			this.#sendResponse(startHelpText(), replyChatId);
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
		this.telegramControl.pausePolling?.();
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
					this.#sendResponse("Error: Failed to build request", replyChatId);
					return;
				}

				const rateResult = normalizeRateLimitResult(this.rateLimit.check?.());
				if (!rateResult.ok) {
					this.history.rollback(marker);
					this.#sendResponse(rateResult.reason, replyChatId);
					return;
				}

				const llmResponse = this.#requestWithRetry(request);
				if (!llmResponse.ok) {
					this.history.rollback(marker);
					this.#sendResponse("Error: Failed to contact LLM API after retries", replyChatId);
					return;
				}

				this.rateLimit.recordRequest?.();

				let parsed;
				try {
					parsed = this.requestCodec.parseResponse(llmResponse.responseText);
				}
				catch {
					this.history.rollback(marker);
					this.#sendResponse("Error: Failed to parse LLM response", replyChatId);
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
				this.#sendResponse(responseText, replyChatId);
				if (isNonCommandMessage)
					this.#updateSuccessfulReplayState(userMessage);
				return;
			}

			this.history.addAssistant("(Reached max tool iterations)");
			this.#sendResponse("(Reached max tool iterations)", replyChatId);
		}
		finally {
			this.telegramControl.resumePolling?.();
		}
	}

	async processMessageAsync(text, options = {}) {
		const userMessage = String(text ?? "");
		const source = options.source ?? "channel";
		const replyChatId = options.replyChatId ?? 0;
		const isNonCommandMessage = !isSlashCommand(userMessage);
		const isCronTrigger = isCronTriggerMessage(userMessage);

		if (isCommand(userMessage, "resume")) {
			if (!this.messagesPaused) {
				await this.#sendResponseAsync("zclaw is already active.", replyChatId);
				return;
			}
			this.messagesPaused = false;
			await this.#sendResponseAsync("zclaw resumed. Send /start for command help.", replyChatId);
			return;
		}

		if (isCommand(userMessage, "settings")) {
			await this.#sendResponseAsync(settingsText({paused: this.messagesPaused, persona: this.persona}), replyChatId);
			return;
		}

		if (this.#isLocalAdminCommand(userMessage)) {
			await this.#handleLocalAdminAsync(userMessage, source, replyChatId);
			return;
		}

		if (this.messagesPaused)
			return;

		if (isCommand(userMessage, "help")) {
			await this.#sendResponseAsync(startHelpText(), replyChatId);
			return;
		}

		if (isCommand(userMessage, "stop")) {
			this.messagesPaused = true;
			await this.#sendResponseAsync("zclaw paused. I will ignore new messages until /resume.", replyChatId);
			return;
		}

		if (isCommand(userMessage, "start")) {
			const nowMs = this.clock.nowMs();
			if (this.lastStartResponseMs && ((nowMs - this.lastStartResponseMs) < START_COMMAND_COOLDOWN_MS))
				return;
			this.lastStartResponseMs = nowMs;
			await this.#sendResponseAsync(startHelpText(), replyChatId);
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
		await this.telegramControl.pausePolling?.();
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
					await this.#sendResponseAsync("Error: Failed to build request", replyChatId);
					return;
				}

				const rateResult = normalizeRateLimitResult(this.rateLimit.check?.());
				if (!rateResult.ok) {
					this.history.rollback(marker);
					await this.#sendResponseAsync(rateResult.reason, replyChatId);
					return;
				}

				const llmResponse = await this.#requestWithRetryAsync(request);
				if (!llmResponse.ok) {
					this.history.rollback(marker);
					await this.#sendResponseAsync("Error: Failed to contact LLM API after retries", replyChatId);
					return;
				}

				this.rateLimit.recordRequest?.();

				let parsed;
				try {
					parsed = this.requestCodec.parseResponse(llmResponse.responseText);
				}
				catch {
					this.history.rollback(marker);
					await this.#sendResponseAsync("Error: Failed to parse LLM response", replyChatId);
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
				await this.#sendResponseAsync(responseText, replyChatId);
				if (isNonCommandMessage)
					this.#updateSuccessfulReplayState(userMessage);
				return;
			}

			this.history.addAssistant("(Reached max tool iterations)");
			await this.#sendResponseAsync("(Reached max tool iterations)", replyChatId);
		}
		finally {
			await this.telegramControl.resumePolling?.();
		}
	}
}
