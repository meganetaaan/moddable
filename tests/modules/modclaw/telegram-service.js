/*---
description:
flags: [module, async]
---*/

import {HttpGate} from "../../../contributed/zclaw/modules/httpGate.js";
import {NVS_KEYS} from "../../../contributed/zclaw/modules/config.js";
import {TelegramService} from "../../../contributed/zclaw/modules/telegramService.js";

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
	}

	set(callback, delay) {
		const id = this.nextId++;
		this.tasks.push({id, callback, delay});
		return id;
	}

	clear(id) {
		this.tasks = this.tasks.filter(task => task.id !== id);
	}

	async runNext() {
		const task = this.tasks.shift();
		if (!task)
			return false;
		await task.callback();
		return true;
	}
}

const store = new Map([
	[NVS_KEYS.TG_TOKEN, "8291539104:AAGxpPliHXAghCqdmIlQwPMwcrF-4ibBpgk"],
	[NVS_KEYS.TG_CHAT_IDS, "7585013353,-100222333444"],
]);
const transport = new FakeTransport;
const timer = new FakeTimer;
const received = [];
const service = new TelegramService({
	store,
	transport,
	timer,
	httpGate: new HttpGate,
	backend: "openai",
	async onMessage(text, options) {
		received.push({text, options});
	},
});

let config = service.init();
assert.sameValue(config.configured, true);
assert.sameValue(config.botId, "8291539104");
assert.sameValue(config.allowedChatIds.length, 2);

transport.push({
	ok: true,
	text: JSON.stringify({
		ok: true,
		result: [{
			update_id: 41,
			message: {text: "stale", chat: {id: 7585013353}},
		}],
	}),
});
assert.sameValue(service.start(), true);
await timer.runNext();
assert.sameValue(service.lastUpdateId, 41);
assert(transport.requests[0].url.includes("timeout=0"));

transport.push({
	ok: true,
	text: JSON.stringify({
		ok: true,
		result: [
			{update_id: 42, message: {text: "ignore", chat: {id: 999999}}},
			{update_id: 43, message: {text: "hello from telegram", chat: {id: -100222333444}}},
		],
	}),
});
await timer.runNext();
assert.sameValue(received.length, 1);
assert.sameValue(received[0].text, "hello from telegram");
assert.sameValue(received[0].options.replyChatId, -100222333444);
assert.sameValue(service.lastUpdateId, 43);
assert.sameValue(store.get(NVS_KEYS.TG_OFFSET), "43");

let sendResponse = {ok: true, text: "{\"ok\":true}"};
transport.push(sendResponse);
let sent = await service.send("reply");
assert.sameValue(sent.ok, true);
assert(transport.requests[2].url.includes("sendMessage"));

sent = await service.send("blocked", 12345);
assert.sameValue(sent.ok, false);

service.pause();
assert.sameValue(timer.tasks.length, 0);
service.resume();
assert.sameValue(timer.tasks.length, 1);
service.stop();
