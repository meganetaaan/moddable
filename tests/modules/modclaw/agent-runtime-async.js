/*---
description:
flags: [module, async]
---*/

import {AgentRuntime} from "../../../contributed/zclaw/modules/agentRuntime.js";

class FakeClock {
	constructor() {
		this.nowValue = 1000;
		this.delays = [];
	}

	nowMs() {
		return this.nowValue;
	}

	async sleepMs(ms) {
		this.delays.push(ms);
		this.nowValue += ms;
	}
}

class FakeAsyncLLM {
	constructor() {
		this.requests = [];
	}

	async request(request) {
		this.requests.push(request);
		return {ok: true, responseText: JSON.stringify({text: "async reply"})};
	}
}

const outputs = {
	channel: [],
	telegram: [],
	async sendChannel(text) {
		this.channel.push(text);
	},
	async sendTelegram(text, chatId) {
		this.telegram.push({text, chatId});
	},
};

const runtime = new AgentRuntime({
	clock: new FakeClock,
	llm: new FakeAsyncLLM,
	tools: {
		list() {
			return [];
		},
	},
	requestCodec: {
		buildRequest({systemPrompt, history, tools}) {
			return JSON.stringify({systemPrompt, history, tools});
		},
		parseResponse(responseText) {
			return JSON.parse(responseText);
		},
	},
	outputs,
	telegramControl: {
		async pausePolling() {
		},
		async resumePolling() {
		},
	},
});

await runtime.processMessageAsync("hello", {source: "telegram", replyChatId: 42});
assert.sameValue(outputs.channel[0], "async reply");
assert.sameValue(outputs.telegram[0].text, "async reply");
assert.sameValue(outputs.telegram[0].chatId, 42);
