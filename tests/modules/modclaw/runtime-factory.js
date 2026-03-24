/*---
description:
flags: [module]
---*/

import {createZclawRuntime} from "../../../contributed/zclaw/modules/runtimeFactory.js";

class FakeClock {
	constructor(nowMs = 0) {
		this.value = nowMs;
	}
	nowMs() {
		return this.value;
	}
	sleepMs(ms) {
		this.value += ms;
	}
	nowDate() {
		return new Date("2026-03-18T12:00:00Z");
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

const clock = new FakeClock(1000);
const llm = new FakeLLM;
const outputs = {
	channel: [],
	telegram: [],
	sendChannel(text) {
		this.channel.push(text);
	},
	sendTelegram(text, chatId) {
		this.telegram.push({text, chatId});
	},
};

const assembled = createZclawRuntime({
	clock,
	llm,
	outputs,
	provider: {
		backend: "anthropic",
	},
	hardware: {
		gpioReadAll() {
			return {ok: true, text: "{\"pins\":{\"4\":1}}"};
		},
	},
	system: {
		version: "1.0.0",
		diagnostics() {
			return "diag";
		},
		health() {
			return "health";
		},
		now() {
			return new Date("2026-03-18T12:00:00Z");
		},
		timeSynced() {
			return true;
		},
	},
});

llm.push(true, "{\"content\":[{\"type\":\"text\",\"text\":\"hello from codec\"}]}");
assembled.runtime.processMessage("hello");
assert.sameValue("hello from codec", outputs.channel[0]);
assert.sameValue(1, assembled.rateLimit.getRequestsToday());
assert(llm.requests[0].includes("\"system\":\""));

let result = assembled.tools.execute("memory_set", {key: "u_name", value: "ada"});
assert.sameValue(true, result.ok);
assert.sameValue("Saved: u_name = ada", result.text);
result = assembled.tools.execute("memory_get", {key: "u_name"});
assert.sameValue("u_name = ada", result.text);
