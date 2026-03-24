/*---
description:
flags: [module, async]
---*/

import {NVS_KEYS} from "../../../contributed/zclaw/modules/config.js";
import {createManagedZclawRuntime} from "../../../contributed/zclaw/modules/managedRuntime.js";

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

transport.push({ok: true, text: JSON.stringify({choices: [{message: {content: "channel reply"}}]})});
transport.push({ok: true, text: "{\"ok\":true}"});
await app.processChannelMessage("hello");
assert.sameValue(lines[0], "channel reply");
assert(transport.requests[1].url.includes("openai.com"));

app.cronScheduler.create({type: "once", delayMinutes: 1, action: "cron hello"}, clock.nowMs());
clock.value = 61_000;
transport.push({ok: true, text: JSON.stringify({choices: [{message: {content: "cron reply"}}]})});
transport.push({ok: true, text: "{\"ok\":true}"});
const due = await app.runCronDue(clock.nowMs());
assert.sameValue(due.length, 1);
assert.sameValue(lines[1], "cron reply");

app.stop();
assert.sameValue(timer.repeats.length, 0);
