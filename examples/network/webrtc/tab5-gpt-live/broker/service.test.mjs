/*
 * Copyright (c) 2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {createBroker} from "./service.mjs";

const deviceToken = "device_" + "a".repeat(36);
const offer = {transport: {type: "webrtc", sdp: "v=0\r\ntest"}};
async function setup(options = {}) {
	const requests = []; let serial = 0, time = Date.now();
	const broker = createBroker({apiKey: "SERVER_ONLY_KEY", deviceToken, session: {model: "gpt-live-1"},
		now: () => time,
		fetch: async (url, init) => {
			requests.push({url, init});
			if (url.endsWith("/hangup")) return new Response(null, {status: 200});
			return Response.json({session: {id: `live_${++serial}`}, transport: {type: "webrtc", sdp: "v=0\r\nanswer"}}, {status: 201});
		}, ...options});
	const server = createServer(broker.handler); server.listen(0, "127.0.0.1"); await once(server, "listening");
	const origin = `http://127.0.0.1:${server.address().port}`;
	async function post(path, token, value = {}) {
		return fetch(origin + path, {method: "POST", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"}, body: JSON.stringify(value)});
	}
	return {broker, requests, post, advance(ms) { time += ms; },
		async token() { const r = await post("/token", deviceToken); assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store"); return (await r.json()).value; },
		async close() { await broker.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }};
}

test("device authentication and single-use session token", async () => {
	const h = await setup();
	try {
		assert.equal((await h.post("/token", "wrong_" + "b".repeat(36))).status, 401);
		assert.equal((await h.post("/sessions", deviceToken, offer)).status, 401);
		const token = await h.token();
		const first = await h.post("/sessions", token, offer); assert.equal(first.status, 201);
		const result = await first.json(); assert.ok(result.broker.control_token);
		assert.equal((await h.post("/sessions", token, offer)).status, 401);
		assert.equal(h.requests.length, 1);
		assert.equal(h.requests[0].init.headers.Authorization, "Bearer SERVER_ONLY_KEY");
		assert.equal(JSON.stringify(result).includes("SERVER_ONLY_KEY"), false);
	} finally { await h.close(); }
});
test("racing uses of a token create exactly one session", async () => {
	const h = await setup();
	try {
		const token = await h.token();
		const responses = await Promise.all([h.post("/sessions", token, offer), h.post("/sessions", token, offer)]);
		assert.deepEqual(responses.map(r => r.status).sort(), [201, 401]); assert.equal(h.requests.length, 1);
	} finally { await h.close(); }
});
test("expired tokens cannot create sessions", async () => {
	const h = await setup();
	try {
		const token = await h.token(); h.advance(61000);
		assert.equal((await h.post("/sessions", token, offer)).status, 401); assert.equal(h.requests.length, 0);
	} finally { await h.close(); }
});
test("server controls session policy and rejects client overrides", async () => {
	const h = await setup();
	try {
		const token = await h.token();
		assert.equal((await h.post("/sessions", token, {...offer, session: {model: "other"}})).status, 400);
		assert.equal((await h.post("/sessions", token, offer)).status, 401);
		await h.post("/sessions", await h.token(), offer);
		const body = JSON.parse(h.requests[0].init.body);
		assert.equal(body.session.model, "gpt-live-1"); assert.equal(body.session.store, false);
		assert.ok(body.session.client.data_channel.allowed_client_events.includes("response.item.create"));
		assert.ok(!body.session.client.data_channel.allowed_client_events.includes("session.update"));
	} finally { await h.close(); }
});
test("control tokens can only hang up their own session", async () => {
	const h = await setup();
	try {
		const first = await (await h.post("/sessions", await h.token(), offer)).json();
		const second = await (await h.post("/sessions", await h.token(), offer)).json();
		const path = `/sessions/${first.session.id}/hangup`;
		assert.equal((await h.post(path, second.broker.control_token)).status, 401);
		assert.equal((await h.post(path, deviceToken)).status, 401);
		assert.equal((await h.post(path, first.broker.control_token)).status, 200);
		assert.equal(h.broker.stats.sessions, 1);
	} finally { await h.close(); }
});
test("upstream errors consume the token without returning private error details", async () => {
	let count = 0;
	const h = await setup({fetch: async () => { count++; return new Response("SECRET", {status: 500}); }});
	try {
		const token = await h.token(), response = await h.post("/sessions", token, offer);
		assert.equal(response.status, 502); assert.ok(!(await response.text()).includes("SECRET"));
		assert.equal((await h.post("/sessions", token, offer)).status, 401); assert.equal(count, 1);
	} finally { await h.close(); }
});
test("capacity is bounded and released after hangup", async () => {
	const h = await setup({maxSessions: 1});
	try {
		const result = await (await h.post("/sessions", await h.token(), offer)).json();
		assert.equal((await h.post("/token", deviceToken)).status, 429);
		await h.post(`/sessions/${result.session.id}/hangup`, result.broker.control_token);
		assert.equal((await h.post("/token", deviceToken)).status, 200);
	} finally { await h.close(); }
});
test("shutdown hangs up owned sessions and invalidates outstanding tokens", async () => {
	const h = await setup();
	try {
		await h.post("/sessions", await h.token(), offer); const unused = await h.token();
		await h.broker.close(); assert.deepEqual(h.broker.stats, {tokens: 0, sessions: 0, pending: 0});
		assert.equal((await h.post("/sessions", unused, offer)).status, 503);
		assert.equal(h.requests.filter(r => r.url.endsWith("/hangup")).length, 1);
	} finally { await h.close(); }
});
