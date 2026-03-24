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
import {TelegramService} from "./telegramService.js";
import {ToolRuntime} from "./toolRuntime.js";

function defaultChannelWriter(text) {
	trace(`${text}\n`);
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
	const outputs = options.outputs ?? {
		sendChannel(text) {
			(options.channelWriter ?? defaultChannelWriter)(text);
		},
		sendTelegram(text, chatId) {
			return telegram?.send(text, chatId);
		},
	};
	const telegramControl = options.telegramControl ?? {
		pausePolling() {
			telegram?.pause();
		},
		resumePolling() {
			telegram?.resume();
		},
	};
	const localAdmin = options.localAdmin ?? new LocalAdminController(options.localAdminOptions);

	const runtime = new AgentRuntime({
		clock,
		llm,
		tools: toolRuntime,
		rateLimit,
		personaStore,
		localAdmin,
		telegramControl,
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
			cronTimerId = timer.repeat(() => void cronTick(), cronIntervalMs);
		telegram.start({
			onMessage(text, messageOptions) {
				return runtime.processMessageAsync(text, messageOptions);
			},
		});
		return {
			telegramConfigured: telegram.isConfigured(),
		};
	}

	function stop() {
		if (cronTimerId) {
			timer?.clear?.(cronTimerId);
			cronTimerId = 0;
		}
		telegram.stop();
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
		start,
		stop,
		runCronDue,
		processChannelMessage(text) {
			return runtime.processMessageAsync(text, {source: "channel"});
		},
		processTelegramMessage(text, replyChatId) {
			return runtime.processMessageAsync(text, {source: "telegram", replyChatId});
		},
	};
}
