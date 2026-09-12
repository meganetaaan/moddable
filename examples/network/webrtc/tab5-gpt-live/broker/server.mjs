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

import {createServer} from "node:https";
import {readFile} from "node:fs/promises";
import {createBroker} from "./service.mjs";

const session = JSON.parse(await readFile(new URL("./session.json", import.meta.url), "utf8"));
const key = await readFile(process.env.LIVE_BROKER_TLS_KEY);
const cert = await readFile(process.env.LIVE_BROKER_TLS_CERT);
const broker = createBroker({apiKey: process.env.OPENAI_API_KEY, deviceToken: process.env.LIVE_BROKER_DEVICE_TOKEN,
	session, maxSessionSeconds: Number(process.env.LIVE_BROKER_MAX_SESSION_SECONDS ?? 3600),
	onEvent(type) { console.log(type); }});
const server = createServer({key, cert, minVersion: "TLSv1.2", requestTimeout: 45000, headersTimeout: 10000}, broker.handler);
server.maxConnections = 32;
server.listen(Number(process.env.PORT ?? 8443), process.env.HOST ?? "127.0.0.1", () => console.log("Live broker listening with TLS"));
let stopping = false;
async function stop() {
	if (stopping) return; stopping = true;
	server.close();
	try { await broker.close(); }
	catch { console.error("Session cleanup failed during shutdown"); process.exitCode = 1; }
	server.closeAllConnections();
}
process.on("SIGINT", stop); process.on("SIGTERM", stop);
