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

import {createHash, randomBytes, timingSafeEqual} from "node:crypto";

class HttpError extends Error {
	constructor(status, code) { super(code); this.status = status; }
}
const hash = value => createHash("sha256").update(value).digest();
const opaque = () => randomBytes(32).toString("base64url");
function bearer(request) {
	const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.authorization ?? "");
	if (!match) throw new HttpError(401, "unauthorized");
	return match[1];
}
function reply(response, status, body) {
	response.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"});
	response.end(JSON.stringify(body));
}
async function body(request) {
	let size = 0; const chunks = [];
	for await (const chunk of request) {
		size += chunk.length;
		if (size > 131072) throw new HttpError(413, "request_too_large");
		chunks.push(chunk);
	}
	try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
	catch { throw new HttpError(400, "invalid_json"); }
}
async function upstreamJSON(response) {
	let size = 0; const chunks = [];
	for await (const chunk of response.body ?? []) {
		size += chunk.length;
		if (size > 131072) throw new HttpError(502, "upstream_response_too_large");
		chunks.push(Buffer.from(chunk));
	}
	try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
	catch { throw new HttpError(502, "invalid_upstream_response"); }
}

export function createBroker({apiKey, deviceToken, session, fetch: requestUpstream = globalThis.fetch,
	now = Date.now, tokenSeconds = 60, maxSessions = 8, maxSessionSeconds = 3600, onEvent = () => {}}) {
	if (!apiKey || !/^[A-Za-z0-9_-]{32,256}$/.test(deviceToken ?? "")) throw new Error("Server credentials are required");
	if (!session || session.model !== "gpt-live-1") throw new Error("A GPT-Live session configuration is required");
	if (!Number.isInteger(tokenSeconds) || tokenSeconds < 1 || tokenSeconds > 300 ||
		!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 64 ||
		!Number.isInteger(maxSessionSeconds) || maxSessionSeconds < 15 || maxSessionSeconds > 7200)
		throw new Error("Invalid broker limits");
	const configuration = JSON.parse(JSON.stringify(session));
	// The frontend can operate its registered tools, but cannot change server policy.
	configuration.client = {data_channel: {
		allowed_client_events: ["session.close", "session.input_audio.mute", "session.input_audio.unmute", "response.item.create", "response.create"],
		allowed_server_events: "all"
	}};
	configuration.store = false;
	const deviceHash = hash(deviceToken), tokens = new Map, sessions = new Map;
	let pending = 0, stopped = false;
	const emit = type => { try { onEvent(type); } catch {} };
	function sweepTokens() { for (const [key, expiry] of tokens) if (expiry <= now()) tokens.delete(key); }
	async function hangup(record) {
		if (record.closing) return record.closing;
		record.closing = (async () => {
			const response = await requestUpstream(`https://api.openai.com/v1/live/sessions/${encodeURIComponent(record.id)}/hangup`, {
				method: "POST", headers: {Authorization: `Bearer ${apiKey}`}, body: "", signal: AbortSignal.timeout(40000), redirect: "error"
			});
			await response.body?.cancel();
			if (!response.ok && response.status !== 404) throw new HttpError(502, "hangup_failed");
			clearTimeout(record.timer); sessions.delete(record.id); emit("session.released");
		})();
		try { await record.closing; } finally { record.closing = undefined; }
	}
	function expire(record) {
		void hangup(record).catch(() => {
			emit("session.cleanup_retry");
			if (!stopped) record.timer = setTimeout(() => expire(record), 30000).unref();
		});
	}
	const handler = async (request, response) => {
		try {
			if (stopped) throw new HttpError(503, "shutting_down");
			if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
			const credential = bearer(request);
			if (request.url === "/token") {
				if (!timingSafeEqual(hash(credential), deviceHash)) throw new HttpError(401, "unauthorized");
				await body(request); sweepTokens();
				if (tokens.size >= 32 || sessions.size + pending >= maxSessions) throw new HttpError(429, "capacity_exceeded");
				const value = opaque(), expires_at = Math.floor(now() / 1000) + tokenSeconds;
				tokens.set(hash(value).toString("hex"), expires_at * 1000);
				reply(response, 200, {value, expires_at}); emit("token.issued"); return;
			}
			if (request.url === "/sessions") {
				const key = hash(credential).toString("hex"), expiry = tokens.get(key);
				tokens.delete(key); // Consume before any await, including validation and upstream failures.
				if (!expiry || expiry <= now()) throw new HttpError(401, "invalid_or_expired_token");
				if (sessions.size + pending >= maxSessions) throw new HttpError(429, "capacity_exceeded");
				pending++;
				try {
					const input = await body(request);
					if (!input || Object.keys(input).some(key => key !== "transport") ||
						input.transport?.type !== "webrtc" || typeof input.transport.sdp !== "string" ||
						!input.transport.sdp.startsWith("v=0") || Buffer.byteLength(input.transport.sdp) > 65536)
						throw new HttpError(400, "invalid_session_request");
					const upstream = await requestUpstream("https://api.openai.com/v1/live/sessions", {
						method: "POST", headers: {Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json"},
						body: JSON.stringify({session: configuration, transport: {type: "webrtc", sdp: input.transport.sdp}}),
						signal: AbortSignal.timeout(40000), redirect: "error"
					});
					if (upstream.status !== 201) { await upstream.body?.cancel(); throw new HttpError(502, "session_creation_failed"); }
					const result = await upstreamJSON(upstream);
					if (typeof result.session?.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(result.session.id))
						throw new HttpError(502, "invalid_upstream_session");
					const control = opaque(), record = {id: result.session.id, hash: hash(control)};
					sessions.set(record.id, record);
					record.timer = setTimeout(() => expire(record), maxSessionSeconds * 1000).unref();
					if (result.transport?.type !== "webrtc" || typeof result.transport.sdp !== "string" || !result.transport.sdp.startsWith("v=0")) {
						await hangup(record); throw new HttpError(502, "invalid_upstream_sdp");
					}
					if (response.destroyed || stopped) { await hangup(record); return; }
					response.once("close", () => { if (!response.writableFinished) expire(record); });
					reply(response, 201, {session: {id: record.id}, transport: result.transport, broker: {control_token: control}});
					emit("session.created"); return;
				}
				finally { pending--; }
			}
			const match = /^\/sessions\/([A-Za-z0-9_-]{1,200})\/hangup$/.exec(request.url);
			if (match) {
				const record = sessions.get(match[1]);
				if (!record || !timingSafeEqual(hash(credential), record.hash)) throw new HttpError(401, "unauthorized");
				await body(request); await hangup(record); reply(response, 200, {closed: true}); return;
			}
			throw new HttpError(404, "not_found");
		}
		catch (error) {
			const status = error instanceof HttpError ? error.status : 502;
			if (!response.destroyed && !response.headersSent) reply(response, status, {error: error instanceof HttpError ? error.message : "broker_request_failed"});
			emit(`request.failed.${status}`);
		}
	};
	return {handler, get stats() { sweepTokens(); return {tokens: tokens.size, sessions: sessions.size, pending}; },
		async close() {
			stopped = true; tokens.clear();
			const results = await Promise.allSettled(Array.from(sessions.values(), record => hangup(record)));
			for (const record of sessions.values()) clearTimeout(record.timer);
			if (results.some(result => result.status === "rejected")) throw new Error("Some sessions could not be closed");
		}};
}
