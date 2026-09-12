// Copyright (c) 2026 Moddable Tech, Inc.
// This file is part of the Moddable SDK.

/*---
description: Live WebRTC protocol, command correlation, and cleanup races
flags: [module]
---*/
import Conversation from "../../../../../modules/network/services/realtimeConversation/core.js";

Object.freeze(Error.prototype);

function check(value, message = "assertion failed") { if (!value) throw new Error(message); }
function equal(a, b) { check(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
async function rejected(promise, code) {
	try { await promise; } catch (error) { equal(error.code, code); return; }
	throw new Error(`expected rejection: ${code}`);
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function harness(options = {}) {
	let callback, requests = [], sent = [], timers = new Map, id = 0, disposed = 0, localMute = false;
	let reply = async () => ({status: 201, ok: true, text: async () => JSON.stringify({session: {id: "live_opaque"}, transport: {type: "webrtc", sdp: "v=0\r\nanswer"}})});
	const events = [], transcripts = [], errors = [], states = [];
	const c = new Conversation({apiKey: "test-key", onEvent: e => events.push(e), onTranscript: e => transcripts.push(e),
		onError: e => errors.push(e), onStateChanged: e => states.push(e), ...options}, {
		createTransport(cb) {
			callback = cb;
			return {start() {}, setVolume() {}, setMuted(v) { localMute = v; },
				acceptAnswer(sdp) { equal(sdp, "v=0\r\nanswer"); }, send(text) { sent.push(JSON.parse(text)); },
				async close() { disposed++; }};
		},
		fetch(url, init) { requests.push({url, init}); return reply(url, init); },
		setTimeout(cb, delay) { const key = ++id; timers.set(key, {cb, delay}); return key; },
		clearTimeout(key) { timers.delete(key); }
	});
	return {c, requests, sent, events, transcripts, errors, states,
		get disposed() { return disposed; }, get localMute() { return localMute; },
		reply(fn) { reply = fn; }, emit(event) { callback(event); },
		message(event) { callback({type: "message", data: JSON.stringify(event)}); },
		timeout(delay) { for (const [key, timer] of timers) if (timer.delay === delay) { timers.delete(key); timer.cb(); break; } },
		async signal() { callback({type: "offer", sdp: "v=0\r\noffer"}); await flush(); },
		async connect() { const p = c.connect(); await this.signal(); this.message({type: "session.started", session: {id: "live_opaque"}}); await p; }
	};
}
let count = 0;
async function test(name, run) { await run(); count++; print(`PASS ${name}`); }
await test("Live session JSON and no session.start on WebRTC", async () => {
	const h = harness(); await h.connect();
	const request = h.requests[0];
	equal(request.url, "https://api.openai.com/v1/live/sessions");
	const body = JSON.parse(request.init.body);
	equal(body.session.model, "gpt-live-1"); equal(body.session.audio.output.voice, "marin");
	equal(body.session.delegation.responses.tools, [{type: "web_search"}]); equal(body.transport.type, "webrtc"); equal(h.sent, []);
	const p = h.c.close(); equal(h.sent, [{type: "session.close"}]);
	h.message({type: "session.closed", reason: "client_request", usage: {seconds: 3}});
	equal(await p, {finalized: true, reason: "client_request", usage: {seconds: 3}}); equal(h.disposed, 1);
});
await test("preserve overlapping transcript fragments and cumulative usage", async () => {
	const h = harness(); await h.connect();
	h.message({type: "session.input_transcript.delta", delta: " 東京", start_ms: 10, end_ms: 40});
	h.message({type: "session.output_transcript.delta", delta: "はい", start_ms: 20, end_ms: 30});
	equal(h.transcripts[0], {role: "user", delta: " 東京", start_ms: 10, end_ms: 40}); equal(h.transcripts[1].role, "assistant");
	h.message({type: "session.usage.updated", usage: {seconds: 8}}); h.message({type: "session.usage.updated", usage: {seconds: 9}});
	equal(h.c.usage.seconds, 9);
	const usage = h.c.usage; usage.seconds = 99; equal(h.c.usage.seconds, 9);
	h.message({type: "response.event", event: {type: "response.completed"}}); equal(h.events.at(-1).type, "response.event");
});
await test("mute acknowledgments must match the command", async () => {
	const h = harness(); await h.connect();
	let resolved = false;
	const p = h.c.setMuted(true).then(() => { resolved = true; });
	check(h.localMute); h.message({type: "session.input_audio.muted", client_event_id: "wrong"}); await flush(); check(!resolved);
	h.message({type: "session.input_audio.muted", client_event_id: h.sent.at(-1).event_id}); await p;
	const unmute = h.c.setMuted(false); check(h.localMute);
	h.message({type: "session.input_audio.unmuted", client_event_id: h.sent.at(-1).event_id}); await unmute; check(!h.localMute);
});
await test("unmute timeout keeps microphone locally muted", async () => {
	const h = harness(); await h.connect();
	let p = h.c.setMuted(true); h.message({type: "session.input_audio.muted", client_event_id: h.sent.at(-1).event_id}); await p;
	p = h.c.setMuted(false); const failure = rejected(p, "command_timeout"); h.timeout(5000); await failure; check(h.localMute && h.c.muted);
});
await test("concurrent mute commands are rejected", async () => {
	const h = harness(); await h.connect();
	const p = h.c.setMuted(true); await rejected(h.c.setMuted(false), "command_pending");
	h.message({type: "session.input_audio.muted", client_event_id: h.sent.at(-1).event_id}); await p;
});
await test("close before an offer avoids creating a session", async () => {
	const h = harness(); const p = rejected(h.c.connect(), "cancelled");
	const closing = h.c.close(); check(closing === h.c.close()); await p;
	equal((await closing).reason, "not_started"); equal(h.requests.length, 0); equal(h.disposed, 1);
});
await test("close during HTTP waits for startup then sends close", async () => {
	const h = harness(); let resolve;
	h.reply(() => new Promise(r => { resolve = r; }));
	const p = rejected(h.c.connect(), "cancelled"); await h.signal(); const closing = h.c.close(); await p;
	resolve({status: 201, text: async () => JSON.stringify({session: {id: "live_opaque"}, transport: {type: "webrtc", sdp: "v=0\r\nanswer"}})});
	await flush(); equal(h.sent.length, 0);
	h.message({type: "session.started", session: {id: "live_opaque"}}); equal(h.sent, [{type: "session.close"}]);
	h.message({type: "session.closed", reason: "client_request"}); check((await closing).finalized);
});
await test("late HTTP answer after timeout triggers bodyless hangup", async () => {
	const h = harness(); let resolve;
	h.reply(() => new Promise(r => { resolve = r; }));
	const p = rejected(h.c.connect(), "cancelled"); await h.signal(); const closing = h.c.close(); await p;
	h.timeout(15000); check(!(await closing).finalized); equal(h.disposed, 1);
	h.reply(async () => ({ok: true, text: async () => ""}));
	resolve({status: 201, text: async () => JSON.stringify({session: {id: "live_opaque"}, transport: {type: "webrtc", sdp: "v=0\r\nanswer"}})});
	await flush(); equal(h.requests[1].url, "https://api.openai.com/v1/live/sessions/live_opaque/hangup"); equal(h.requests[1].init.body, "");
});
await test("HTTP rejection preserves status and cleans up", async () => {
	const h = harness(); h.reply(async () => ({status: 401, text: async () => "private server details"}));
	const p = rejected(h.c.connect(), "http_error"); await h.signal(); await p; await flush();
	equal(h.errors[0].status, 401); check(!h.errors[0].message.includes("private")); equal(h.disposed, 1); equal(h.c.state, "error");
});
await test("invalid JSON and mismatched sessions cannot start", async () => {
	const h = harness(); const p = rejected(h.c.connect(), "session_mismatch"); await h.signal();
	h.message({type: "session.started", session: {id: "wrong"}}); await p; await flush(); equal(h.disposed, 1);
	const j = harness(); await j.connect(); j.emit({type: "message", data: "{"}); await flush(); equal(j.errors[0].code, "invalid_json"); equal(j.disposed, 1);
});
await test("unexpected disconnect is not confirmed finalization", async () => {
	const h = harness(); await h.connect(); h.emit({type: "disconnected"}); await flush();
	const result = await h.c.close(); check(!result.finalized); equal(result.reason, "connection_lost"); equal(h.disposed, 1);
});
await test("server-initiated close and duplicate events clean up once", async () => {
	const h = harness(); await h.connect();
	h.message({type: "session.closed", reason: "maximum_duration", usage: {seconds: 60}});
	h.message({type: "session.closed", reason: "maximum_duration"}); await flush();
	check((await h.c.close()).finalized); equal(h.disposed, 1); equal(h.c.usage.seconds, 60);
});
await test("reentrant close from connecting callback does not start native", async () => {
	let h; h = harness({onStateChanged(s) { if (s === "connecting") void h.c.close(); }});
	await rejected(h.c.connect(), "cancelled"); await flush(); equal(h.disposed, 0); equal(h.c.state, "closed");
});
print(`${count} tests passed`);
