/*---
description:
flags: [module]
---*/

import {AgentRuntime} from "../../../contributed/modclaw/modules/agentRuntime.js";
import {LocalAdminController, LocalAdminAction} from "../../../contributed/modclaw/modules/localAdmin.js";

class FakeClock {
	constructor(nowMs = 0) {
		this.value = nowMs;
		this.delays = [];
	}
	nowMs() {
		return this.value;
	}
	sleepMs(ms) {
		this.delays.push(ms);
		this.value += ms;
	}
}

class FakeLLM {
	constructor() {
		this.responses = [];
		this.requests = [];
	}
	push(ok, responseText) {
		this.responses.push({ok, responseText});
	}
	request(request) {
		this.requests.push(request);
		return this.responses.shift() ?? {ok: false, responseText: ""};
	}
}

class FakeTools {
	constructor() {
		this.calls = [];
		this.userTools = new Map();
	}
	list() {
		return [];
	}
	execute(name, input) {
		this.calls.push({name, input});
		return {ok: true, text: "mock tool executed"};
	}
	findUserTool(name) {
		return this.userTools.get(name) ?? null;
	}
}

class FakeRateLimit {
	constructor() {
		this.allow = true;
		this.reason = "";
		this.recordCount = 0;
	}
	check() {
		return {ok: this.allow, reason: this.reason};
	}
	recordRequest() {
		this.recordCount++;
	}
}

class FakeOutputs {
	constructor() {
		this.channel = [];
		this.telegram = [];
		this.slack = [];
	}
	sendChannel(text) {
		this.channel.push(text);
	}
	sendTelegram(text, chatId) {
		this.telegram.push({text, chatId});
	}
	sendSlack(text, conversationId) {
		this.slack.push({text, conversationId});
	}
}

class FakeTelegramControl {
	constructor() {
		this.pauseCalls = 0;
		this.resumeCalls = 0;
		this.balance = 0;
		this.maxBalance = 0;
	}
	pausePolling() {
		this.pauseCalls++;
		this.balance++;
		if (this.balance > this.maxBalance)
			this.maxBalance = this.balance;
	}
	resumePolling() {
		this.resumeCalls++;
		this.balance--;
	}
}

function createCodec() {
	return {
		buildRequest({systemPrompt, history, tools}) {
			return JSON.stringify({systemPrompt, history, tools});
		},
		parseResponse(responseText) {
			const root = JSON.parse(responseText);
			if (root.text || root.toolName)
				return root;
			let text = "";
			let toolName = "";
			let toolId = "";
			let toolInput = null;
			for (const block of root.content ?? []) {
				if (block.type === "text")
					text = block.text ?? "";
				else if (block.type === "tool_use") {
					toolName = block.name ?? "";
					toolId = block.id ?? "";
					toolInput = block.input ?? null;
				}
			}
			return {text, toolName, toolId, toolInput};
		},
	};
}

function createRuntime() {
	const clock = new FakeClock(1000);
	const llm = new FakeLLM;
	const tools = new FakeTools;
	const rateLimit = new FakeRateLimit;
	const outputs = new FakeOutputs;
	const telegramControl = new FakeTelegramControl;
	let performedAction = LocalAdminAction.NONE;
	const localAdmin = new LocalAdminController({
		bootGuard: {getPersistedCount() { return 3; }},
		wifiStatusProvider() { return "WiFi status: provisioned=yes ssid=Trident"; },
		wifiScanProvider() { return "WiFi scan: 2 APs visible"; },
		flags: {
			isSafeMode() { return true; },
			isDeviceConfigured() { return true; },
		},
		onAction(action) {
			performedAction = action;
		},
	});
	const runtime = new AgentRuntime({
		clock,
		llm,
		tools,
		rateLimit,
		localAdmin,
		telegramControl,
		outputs,
		requestCodec: createCodec(),
	});
	return {runtime, clock, llm, tools, rateLimit, outputs, telegramControl, localAdmin, performedActionRef: () => performedAction};
}

let env = createRuntime();
env.llm.push(false, "");
env.llm.push(false, "");
env.llm.push(true, JSON.stringify({text: "retry succeeded"}));
env.runtime.processMessage("hello");
assert.sameValue(3, env.llm.requests.length);
assert.sameValue(2, env.clock.delays.length);
assert.sameValue(2000, env.clock.delays[0]);
assert.sameValue(4000, env.clock.delays[1]);
assert.sameValue(1, env.rateLimit.recordCount);
assert.sameValue("retry succeeded", env.outputs.channel[0]);
assert.sameValue(0, env.outputs.telegram.length);

env = createRuntime();
env.rateLimit.allow = false;
env.rateLimit.reason = "Rate limit hit";
env.runtime.processMessage("hello");
assert.sameValue(0, env.llm.requests.length);
assert.sameValue("Rate limit hit", env.outputs.channel[0]);

env = createRuntime();
env.llm.push(false, "");
env.llm.push(false, "");
env.llm.push(false, "");
env.llm.push(true, JSON.stringify({text: "fresh response"}));
env.runtime.processMessage("is this really on a tiny board");
assert.sameValue("Error: Failed to contact LLM API after retries", env.outputs.channel[0]);
env.runtime.processMessage("hello");
assert.sameValue("fresh response", env.outputs.channel[1]);
const lastRequest = env.llm.requests[env.llm.requests.length - 1];
assert(lastRequest.includes("hello"));
assert(!lastRequest.includes("is this really on a tiny board"));

env = createRuntime();
env.runtime.processMessage("/start");
assert(env.outputs.channel[0].includes("zclaw online."));
env.runtime.processMessage("/start");
assert.sameValue(1, env.outputs.channel.length);
env.runtime.processMessage("/stop");
assert(env.outputs.channel[1].includes("zclaw paused."));
env.runtime.processMessage("hello");
assert.sameValue(2, env.outputs.channel.length);
env.runtime.processMessage("/resume");
assert(env.outputs.channel[2].includes("zclaw resumed."));
env.runtime.processMessage("/settings");
assert(env.outputs.channel[3].includes("Message intake: active"));

env = createRuntime();
env.runtime.processMessage("/diag memory verbose");
assert.sameValue(1, env.tools.calls.length);
assert.sameValue("get_diagnostics", env.tools.calls[0].name);
assert.sameValue("mock tool executed", env.outputs.channel[0]);
env.runtime.processMessage("/gpio 9 low");
assert.sameValue(2, env.tools.calls.length);
assert.sameValue("gpio_write", env.tools.calls[1].name);

env = createRuntime();
env.runtime.processMessage("/wifi status", {source: "telegram", replyChatId: -100222333444});
assert(env.outputs.channel[0].includes("USB serial console"));
assert(env.outputs.telegram[0].text.includes("USB serial console"));
assert.sameValue(-100222333444, env.outputs.telegram[0].chatId);

env = createRuntime();
env.runtime.processMessage("/factory-reset");
assert(env.outputs.channel[0].includes("Run /factory-reset confirm"));
assert.sameValue(LocalAdminAction.NONE, env.performedActionRef());
env.runtime.processMessage("/factory-reset confirm");
assert(env.outputs.channel[1].includes("Factory reset confirmed"));
assert.sameValue(LocalAdminAction.FACTORY_RESET_REBOOT, env.performedActionRef());

env = createRuntime();
env.llm.push(true, JSON.stringify({
	content: [{
		type: "tool_use",
		id: "toolu_persona_1",
		name: "set_persona",
		input: {persona: "friendly"},
	}],
}));
env.llm.push(true, JSON.stringify({text: "persona changed"}));
env.runtime.processMessage("please switch your personality to friendly");
assert.sameValue("persona changed", env.outputs.channel[0]);
assert.sameValue("set_persona", env.tools.calls[0].name);
assert(env.llm.requests[1].includes("Persona mode is 'friendly'"));

env = createRuntime();
env.llm.push(true, JSON.stringify({
	content: [{
		type: "tool_use",
		id: "toolu_cron_1",
		name: "cron_set",
		input: {type: "once", delay_minutes: 1, action: "arcade_power state=1"},
	}],
}));
env.llm.push(true, JSON.stringify({text: "running scheduled action now"}));
env.runtime.processMessage("[CRON 1] arcade_power state=1");
assert.sameValue(0, env.tools.calls.length);
assert.sameValue("running scheduled action now", env.outputs.channel[0]);
assert(env.llm.requests[1].includes("cron_set is not allowed during scheduled task execution"));

env = createRuntime();
env.llm.push(true, JSON.stringify({text: "hi there"}));
env.runtime.processMessage("What can you do");
env.runtime.processMessage("What can you do");
assert.sameValue(1, env.llm.requests.length);
assert.sameValue(1, env.outputs.channel.length);

env = createRuntime();
env.llm.push(false, "");
env.llm.push(false, "");
env.llm.push(false, "");
env.llm.push(true, JSON.stringify({text: "recovered"}));
env.runtime.processMessage("retry this");
env.runtime.processMessage("retry this");
assert.sameValue(4, env.llm.requests.length);
assert.sameValue("recovered", env.outputs.channel[1]);

env = createRuntime();
env.llm.push(true, JSON.stringify({text: "targeted reply"}));
env.runtime.processMessage("hello", {source: "telegram", replyChatId: -100222333444});
assert.sameValue("targeted reply", env.outputs.telegram[0].text);
assert.sameValue(-100222333444, env.outputs.telegram[0].chatId);
assert.sameValue(1, env.telegramControl.pauseCalls);
assert.sameValue(1, env.telegramControl.resumeCalls);

env = createRuntime();
env.llm.push(true, JSON.stringify({text: "slack reply"}));
env.runtime.processMessage("hello", {
	source: "slack",
	replyTarget: {transport: "slack", conversationId: "D123456", userId: "U123456"},
});
assert.sameValue("slack reply", env.outputs.slack[0].text);
assert.sameValue("D123456", env.outputs.slack[0].conversationId);
assert.sameValue(0, env.outputs.telegram.length);

env = createRuntime();
env.runtime.processMessage("/settings");
assert.sameValue(0, env.telegramControl.pauseCalls);
assert.sameValue(0, env.telegramControl.resumeCalls);
