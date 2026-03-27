import {AgentRuntime} from "./agentRuntime.js";
import {HttpGate} from "./httpGate.js";
import {LLMService} from "./llmService.js";
import {LocalAdminController} from "./localAdmin.js";
import {MemoryStore} from "./memory.js";
import {
	PersistentCronScheduler,
	PersistentUserToolRegistry,
} from "./persistence.js";
import {createProviderCodec} from "./providerCodec.js";
import {RateLimiter} from "./rateLimit.js";
import {SlackService} from "./slackService.js";
import {TelegramService} from "./telegramService.js";
import {ToolRuntime} from "./toolRuntime.js";

function defaultChannelWriter(text) {
	trace(`${text}\n`);
}

function traceRuntimeError(owner, error) {
	trace(`zclaw runtime ${owner} error=${error}\n`);
	if (error?.stack)
		trace(`${error.stack}\n`);
}

function createClock(timer) {
	return {
		nowMs() {
			return Date.now();
		},
		sleepMs(ms) {
			return new Promise(resolve => {
				if (!timer?.set) {
					resolve();
					return;
				}
				timer.set(resolve, ms);
			});
		},
	};
}

export function createManagedZclawRuntime(options = {}) {
	const rawStore = options.rawStore ?? options.store ?? new Map;
	const personaStore = options.personaStore ?? rawStore;
	const rateLimitStore = options.rateLimitStore ?? rawStore;
	const memoryStore = options.memoryStore ?? new MemoryStore(rawStore);
	const userTools = options.userTools ?? new PersistentUserToolRegistry({storage: rawStore});
	const cronScheduler = options.cronScheduler ?? new PersistentCronScheduler({storage: rawStore});
	if (undefined !== options.timeSynced)
		cronScheduler.setTimeSynced(options.timeSynced);

	const toolRuntime = options.toolRuntime ?? new ToolRuntime({
		memoryStore,
		personaStore,
		cronScheduler,
		userTools,
		hardware: options.hardware,
		system: options.system,
	});
	const timer = options.timer ?? null;
	const clock = options.clock ?? createClock(timer);
	const rateLimit = options.rateLimit ?? new RateLimiter({
		store: rateLimitStore,
		now: options.clock?.nowDate ?? options.system?.now ?? (() => new Date()),
	});
	rateLimit.init?.();

	const httpGate = options.httpGate ?? new HttpGate;
	const requestCodec = options.requestCodec ?? createProviderCodec(options.provider);
	const llm = options.llm ?? new LLMService({
		store: rawStore,
		transport: options.transport,
		httpGate,
		overrides: options.provider,
	});
	llm.init?.();

	let telegram;
	let slack;
	const outputs = options.outputs ?? {
		sendChannel(text) {
			(options.channelWriter ?? defaultChannelWriter)(text);
		},
		sendRemote(text, replyTarget) {
			if (!replyTarget)
				return;
			if ("slack" === replyTarget.transport)
				return slack?.send(text, replyTarget.conversationId);
			return telegram?.send(text, replyTarget.chatId ?? 0);
		},
		sendTelegram(text, chatId) {
			return telegram?.send(text, chatId);
		},
		sendSlack(text, conversationId) {
			return slack?.send(text, conversationId);
		},
	};
	const remoteControl = options.remoteControl ?? options.telegramControl ?? {
		pausePolling() {
			telegram?.pause();
			slack?.pause();
		},
		resumePolling() {
			telegram?.resume();
			slack?.resume();
		},
	};
	const transportStatus = options.transportStatus ?? (() => {
		const telegramConfigured = telegram?.isConfigured?.() ?? false;
		const slackConfigured = slack?.isConfigured?.() ?? false;
		return {
			telegramConfigured,
			telegramActive: telegramConfigured && Boolean(telegram?.running) && !telegram?.paused,
			slackConfigured,
			slackActive: slackConfigured && Boolean(slack?.running) && !slack?.paused,
		};
	});
	const localAdmin = options.localAdmin ?? new LocalAdminController(options.localAdminOptions);

	const runtime = new AgentRuntime({
		clock,
		llm,
		tools: toolRuntime,
		rateLimit,
		personaStore,
		localAdmin,
		remoteControl,
		transportStatus,
		outputs,
		requestCodec,
	});
	telegram = options.telegram ?? new TelegramService({
		store: rawStore,
		transport: options.transport,
		httpGate,
		timer,
		backend: llm.getBackend?.() ?? options.provider?.backend ?? "openai",
		classicEsp32Target: Boolean(options.classicEsp32Target),
	});
	slack = options.slack ?? new SlackService({
		store: rawStore,
		transport: options.transport,
		httpGate,
		timer,
	});

	let cronTimerId = 0;
	let cronRunning = false;
	const cronIntervalMs = options.cronIntervalMs ?? 1000;

	async function runCronDue(nowMs = clock.nowMs()) {
		const due = cronScheduler.checkDue(nowMs);
		for (const entry of due)
			await runtime.processMessageAsync(`[CRON ${entry.id}] ${entry.action}`, {source: "system"});
		return due;
	}

	async function cronTick() {
		if (cronRunning)
			return;
		cronRunning = true;
		try {
			await runCronDue(clock.nowMs());
		}
		finally {
			cronRunning = false;
		}
	}

	function start() {
		if (!cronTimerId && timer?.repeat)
			cronTimerId = timer.repeat(() => {
				return cronTick().catch(error => {
					traceRuntimeError("cron_tick", error);
				});
			}, cronIntervalMs);
		const onMessage = (text, messageOptions) => runtime.processMessageAsync(text, messageOptions);
		telegram.start({
			onMessage,
		});
		slack.start({
			onMessage,
		});
		return {
			...transportStatus(),
		};
	}

	function stop() {
		if (cronTimerId) {
			timer?.clear?.(cronTimerId);
			cronTimerId = 0;
		}
		telegram.stop();
		slack.stop();
	}

	return {
		runtime,
		tools: toolRuntime,
		rateLimit,
		localAdmin,
		requestCodec,
		personaStore,
		memoryStore,
		userTools,
		cronScheduler,
		httpGate,
		llm,
		telegram,
		slack,
		start,
		stop,
		runCronDue,
		processChannelMessage(text) {
			return runtime.processMessageAsync(text, {source: "channel"});
		},
		processTelegramMessage(text, replyChatId) {
			return runtime.processMessageAsync(text, {
				source: "telegram",
				replyTarget: replyChatId ? {transport: "telegram", chatId: replyChatId} : null,
				replyChatId,
			});
		},
		processSlackMessage(text, replyConversationId, replyUserId = "") {
			return runtime.processMessageAsync(text, {
				source: "slack",
				replyTarget: replyConversationId ? {
					transport: "slack",
					conversationId: replyConversationId,
					userId: replyUserId,
				} : null,
				replyConversationId,
				replyUserId,
			});
		},
	};
}
