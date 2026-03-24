import {AgentRuntime} from "./agentRuntime.js";
import {RateLimiter} from "./rateLimit.js";
import {LocalAdminController} from "./localAdmin.js";
import {ToolRuntime} from "./toolRuntime.js";
import {createProviderCodec} from "./providerCodec.js";
import {MemoryStore} from "./memory.js";
import {UserToolRegistry} from "../core/userTools.js";
import {CronScheduler} from "../core/cron.js";

export function createZclawRuntime(options = {}) {
	const memoryBacking = options.memoryBacking ?? new Map;
	const personaStore = options.personaStore ?? new Map;
	const rateLimitStore = options.rateLimitStore ?? new Map;
	const userTools = options.userTools ?? new UserToolRegistry;
	const cronScheduler = options.cronScheduler ?? new CronScheduler;
	const memoryStore = options.memoryStore ?? new MemoryStore(memoryBacking);
	const toolRuntime = options.toolRuntime ?? new ToolRuntime({
		memoryStore,
		personaStore,
		cronScheduler,
		userTools,
		hardware: options.hardware,
		system: options.system,
	});
	const localAdmin = options.localAdmin ?? new LocalAdminController(options.localAdminOptions);
	const rateLimit = options.rateLimit ?? new RateLimiter({
		store: rateLimitStore,
		now: options.clock?.nowDate ?? options.system?.now,
	});
	rateLimit.init?.();
	const requestCodec = options.requestCodec ?? createProviderCodec(options.provider);
	const runtime = new AgentRuntime({
		clock: options.clock,
		llm: options.llm,
		tools: toolRuntime,
		rateLimit,
		personaStore,
		localAdmin,
		telegramControl: options.telegramControl,
		outputs: options.outputs,
		requestCodec,
	});

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
	};
}
