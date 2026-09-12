// Copyright (c) 2026 Moddable Tech, Inc.
// This file is part of the Moddable SDK.
/*---
description: Bounded Live signaling HTTP connections close on every terminal path
flags: [module]
---*/
import request from "../../../../../modules/network/services/realtimeConversation/httpCore.js";
function check(v) { if (!v) throw new Error("assertion failed"); }
function setup() {
	let callbacks, clientCallbacks, timeout, closes = 0, clears = 0;
	const client = {request(options) { callbacks = options; }, close() { closes++; }};
	const platform = {
		createClient(options) { clientCallbacks = options; return client; },
		setTimeout(cb, delay) { check(delay === 45000); timeout = cb; return 1; },
		clearTimeout() { clears++; },
		encode(text) { return Uint8Array.from(Array.from(text, c => c.charCodeAt(0))).buffer; },
		decode(buffer) { return String.fromCharCode(...new Uint8Array(buffer)); }
	};
	const promise = request("https://api.openai.com/v1/live/sessions", {method: "POST", headers: {Authorization: "Bearer test"}, body: "{}"}, platform);
	return {promise, get cb() { return callbacks; }, get closes() { return closes; }, get clears() { return clears; },
		timeout() { timeout(); }, error() { clientCallbacks.onError(); }};
}
async function fails(h) {
	let error;
	try { await h.promise; } catch (e) { error = e; }
	check(error instanceof Error); check(h.closes === 1 && h.clears === 1);
}
{
	const h = setup(); const pieces = [];
	const ctx = {write(view) { if (view) pieces.push(...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)); }, read(count) { return Uint8Array.from([79, 75]).buffer; }};
	h.cb.onWritable.call(ctx, 1); h.cb.onWritable.call(ctx, 20); h.cb.onWritable.call(ctx, 20);
	check(String.fromCharCode(...pieces) === "{}");
	h.cb.onHeaders(201, new Map); h.cb.onReadable.call(ctx, 2); h.cb.onDone();
	const response = await h.promise; check(response.status === 201 && await response.text() === "OK");
	h.error(); h.cb.onDone(); check(h.closes === 1 && h.clears === 1);
}
{
	const h = setup(); h.error(); await fails(h);
}
{
	const h = setup(); h.timeout(); await fails(h);
}
{
	const h = setup(); h.cb.onHeaders(201, new Map([["content-length", "131073"]])); await fails(h);
}
{
	const h = setup(); const ctx = {read(n) { return new ArrayBuffer(n); }};
	h.cb.onHeaders(201, new Map); h.cb.onReadable.call(ctx, 65536); h.cb.onReadable.call(ctx, 65536); h.cb.onReadable.call(ctx, 1);
	await fails(h);
}
{
	const h = setup(); h.cb.onDone(new Error("socket")); await fails(h);
}
print("6 HTTP cleanup tests passed");
