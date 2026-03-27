/*---
description:
flags: [module, async]
---*/

import {HttpGate} from "../../../contributed/modclaw/modules/httpGate.js";
import {NVS_KEYS} from "../../../contributed/modclaw/modules/config.js";
import {SlackService} from "../../../contributed/modclaw/modules/slackService.js";

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

	set(callback, delay = 0) {
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

let service = new SlackService({
	store: new Map,
	transport: new FakeTransport,
	timer: new FakeTimer,
});
assert.sameValue(service.start(), false);

const store = new Map([
	[NVS_KEYS.SLACK_TOKEN, "xoxb-test-token"],
	[NVS_KEYS.SLACK_USER_IDS, "U12345678"],
]);
const transport = new FakeTransport;
const timer = new FakeTimer;
const received = [];
service = new SlackService({
	store,
	transport,
	timer,
	httpGate: new HttpGate,
	async onMessage(text, options) {
		received.push({text, options});
	},
});

let config = service.init();
assert.sameValue(config.configured, true);
assert.sameValue(config.allowedUserIds.length, 1);
assert.sameValue(config.allowedUserIds[0], "U12345678");

transport.push({
	ok: true,
	text: JSON.stringify({
		ok: true,
		channels: [{id: "D12345678", is_im: true, user: "U12345678"}],
		response_metadata: {next_cursor: ""},
	}),
});
transport.push({
	ok: true,
	text: JSON.stringify({
		ok: true,
		messages: [{ts: "1710000000.000200"}],
	}),
});
assert.sameValue(service.start(), true);
await timer.runNext();
assert(transport.requests[0].url.includes("conversations.list"));
assert(transport.requests[1].url.includes("conversations.history"));
assert.sameValue(JSON.parse(store.get(NVS_KEYS.SLACK_STATE)).cursorByChannelId.D12345678, "1710000000.000200");

transport.push({
	ok: true,
	text: JSON.stringify({
		ok: true,
		channels: [{id: "D12345678", is_im: true, user: "U12345678"}],
		response_metadata: {next_cursor: ""},
	}),
});
transport.push({
	ok: true,
	text: JSON.stringify({
		ok: true,
		messages: [
			{type: "message", user: "U12345678", text: "latest", ts: "1710000000.000300"},
			{type: "message", user: "U99999999", text: "ignore me", ts: "1710000000.000250"},
			{type: "message", user: "U12345678", subtype: "bot_message", text: "ignore bot", ts: "1710000000.000260"},
			{type: "message", user: "U12345678", text: "first", ts: "1710000000.000210"},
		],
	}),
});
await timer.runNext();
assert.sameValue(received.length, 2);
assert.sameValue(received[0].text, "first");
assert.sameValue(received[0].options.replyTarget.transport, "slack");
assert.sameValue(received[0].options.replyTarget.conversationId, "D12345678");
assert.sameValue(received[1].text, "latest");
assert.sameValue(JSON.parse(store.get(NVS_KEYS.SLACK_STATE)).cursorByChannelId.D12345678, "1710000000.000300");

transport.push({
	ok: true,
	text: JSON.stringify({
		ok: true,
		channels: [{id: "D12345678", is_im: true, user: "U12345678"}],
		response_metadata: {next_cursor: ""},
	}),
});
transport.push({ok: true, text: "{\"ok\":true}"});
let sent = await service.send("reply");
assert.sameValue(sent.ok, true);
const sendRequest = transport.requests[transport.requests.length - 1];
assert(sendRequest.url.includes("chat.postMessage"));
assert.sameValue(JSON.parse(sendRequest.body).channel, "D12345678");

service.pause();
assert.sameValue(timer.tasks.length, 0);
service.resume();
assert.sameValue(timer.tasks.length, 1);
service.stop();
