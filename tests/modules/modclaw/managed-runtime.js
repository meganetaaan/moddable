/*---
description:
flags: [module, async]
---*/

import {NVS_KEYS} from "../../../contributed/modclaw/modules/config.js";
import {createManagedZclawRuntime} from "../../../contributed/modclaw/modules/managedRuntime.js";

class FakeTransport {
	constructor() {
		this.requests = [];
		this.responses = [];
	}

	push(response) {
		this.responses.push(response);
	}

	async requestText(request) {
		this.requests.push(request);
		return this.responses.shift() ?? {ok: false, text: ""};
	}
}

class FakeTimer {
	constructor() {
		this.nextId = 1;
		this.tasks = [];
		this.repeats = [];
	}

	set(callback, delay = 0) {
		const id = this.nextId++;
		this.tasks.push({id, callback, delay});
		return id;
	}

	repeat(callback, interval) {
		const id = this.nextId++;
		this.repeats.push({id, callback, interval});
		return id;
	}

	clear(id) {
		this.tasks = this.tasks.filter(task => task.id !== id);
		this.repeats = this.repeats.filter(task => task.id !== id);
	}

	async runNextTask() {
		const task = this.tasks.shift();
		if (!task)
			return false;
		await task.callback();
		return true;
	}
}

class FakeClock {
	constructor(nowMs = 0) {
		this.value = nowMs;
	}

	nowMs() {
		return this.value;
	}

	async sleepMs(ms) {
		this.value += ms;
	}
}

class FakeLLM {
	constructor() {
		this.responses = [];
		this.requests = [];
	}

	push(text) {
		this.responses.push(text);
	}

	async request(request) {
		this.requests.push(request);
		return {
			ok: true,
			responseText: JSON.stringify({text: this.responses.shift() ?? ""}),
		};
	}
}

class FakeRemoteService {
	constructor() {
		this.sent = [];
		this.running = false;
		this.paused = false;
	}

	isConfigured() {
		return true;
	}

	start(options = {}) {
		this.onMessage = options.onMessage ?? null;
		this.running = true;
		return true;
	}

	stop() {
		this.running = false;
	}

	pause() {
		this.paused = true;
	}

	resume() {
		this.paused = false;
	}

	async send(text, target) {
		this.sent.push({text, target});
		return {ok: true, text: ""};
	}
}

const transport = new FakeTransport;
const timer = new FakeTimer;
const clock = new FakeClock(0);
const lines = [];
const rawStore = new Map([
	[NVS_KEYS.API_KEY, "sk-test"],
	[NVS_KEYS.TG_TOKEN, "8291539104:AAGxpPliHXAghCqdmIlQwPMwcrF-4ibBpgk"],
	[NVS_KEYS.TG_CHAT_IDS, "7585013353"],
]);

const app = createManagedZclawRuntime({
	rawStore,
	transport,
	timer,
	clock,
	channelWriter(text) {
		lines.push(text);
	},
	system: {
		now() {
			return new Date(clock.nowMs());
		},
	},
	timeSynced: true,
});

transport.push({ok: true, text: JSON.stringify({ok: true, result: []})});
let started = app.start();
assert.sameValue(started.telegramConfigured, true);
await timer.runNextTask();

transport.push({ok: true, text: JSON.stringify({
	output: [{type: "message", role: "assistant", content: [{type: "output_text", text: "channel reply"}]}],
})});
await app.processChannelMessage("hello");
assert.sameValue(lines[0], "channel reply");
assert(transport.requests[1].url.includes("openai.com"));

app.cronScheduler.create({type: "once", delayMinutes: 1, action: "cron hello"}, clock.nowMs());
clock.value = 61_000;
transport.push({ok: true, text: JSON.stringify({
	output: [{type: "message", role: "assistant", content: [{type: "output_text", text: "cron reply"}]}],
})});
const due = await app.runCronDue(clock.nowMs());
assert.sameValue(due.length, 1);
assert.sameValue(lines[1], "cron reply");

app.stop();
assert.sameValue(timer.repeats.length, 0);

const remoteLines = [];
const remoteClock = new FakeClock(0);
const remoteLLM = new FakeLLM;
const fakeTelegram = new FakeRemoteService;
const fakeSlack = new FakeRemoteService;
const remoteApp = createManagedZclawRuntime({
	rawStore: new Map([
		[NVS_KEYS.API_KEY, "sk-test"],
	]),
	clock: remoteClock,
	llm: remoteLLM,
	telegram: fakeTelegram,
	slack: fakeSlack,
	channelWriter(text) {
		remoteLines.push(text);
	},
	requestCodec: {
		buildRequest({history}) {
			return JSON.stringify({history});
		},
		parseResponse(responseText) {
			return JSON.parse(responseText);
		},
	},
	system: {
		now() {
			return new Date(remoteClock.nowMs());
		},
	},
	timeSynced: true,
});

started = remoteApp.start();
assert.sameValue(started.telegramConfigured, true);
assert.sameValue(started.telegramActive, true);
assert.sameValue(started.slackConfigured, true);
assert.sameValue(started.slackActive, true);

remoteLLM.push("telegram reply");
await remoteApp.processTelegramMessage("hello", 7585013353);
assert.sameValue(fakeTelegram.sent[0].text, "telegram reply");
assert.sameValue(fakeTelegram.sent[0].target, 7585013353);
assert.sameValue(fakeSlack.sent.length, 0);

remoteLLM.push("slack reply");
await remoteApp.processSlackMessage("hello", "D123456", "U123456");
assert.sameValue(fakeSlack.sent[0].text, "slack reply");
assert.sameValue(fakeSlack.sent[0].target, "D123456");
assert.sameValue(fakeTelegram.sent.length, 1);

await remoteApp.processSlackMessage("/settings", "D123456", "U123456");
assert(fakeSlack.sent[1].text.includes("Slack: configured, active"));
assert(fakeSlack.sent[1].text.includes("Telegram: configured, active"));
assert(remoteLines[2].includes("Slack: configured, active"));
