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

import {} from "piu/MC";
import Timer from "timer";
import Time from "time";
import keyValue from "embedded:storage/key-value";
import WiFi from "embedded:network/interface/wifi";
import config from "mc/config";
import RealtimeConversation from "realtimeConversation";

let conversation, wifi, view, autoStarted = false, clockReady = false, clockPromise;
let testCycle = 0;
let state = "idle", note = "Wi-Fiに接続しています", muted = false, busy = false, volume = 0.5;
let userText = "", assistantText = "", usage = 0;
const testTimers = new Set;
function scheduleTest(callback, delay) {
	const timer = Timer.set(() => { testTimers.delete(timer); callback(); }, delay);
	testTimers.add(timer);
}
const japanese = new Style({font: "28px NotoSansJP", horizontal: "left"});
const title = new Style({font: "semibold 28px Open Sans", horizontal: "left"});
const states = {idle: "待機中", connecting: "接続中", connected: "会話中", closing: "終了処理中", closed: "終了", error: "接続エラー"};
function invalidate() { view?.invalidate(); }
async function start() {
	if (wifi?.connection < 500) {
		note = "Wi-Fiの接続を待っています"; invalidate(); return;
	}
	if (!clockReady) {
		note = "時刻を確認しています"; invalidate();
		try { await synchronizeClock(); }
		catch (error) { note = error.message; invalidate(); return; }
	}
	if (conversation && !["closed", "error"].includes(conversation.state)) return;
	userText = assistantText = ""; muted = false; usage = 0;
	note = "セッションを開始しています";
	conversation = new RealtimeConversation({
		apiKey: config.openaiApiKey,
		onStateChanged(value) {
			state = value;
			if (value === "connected") note = "話しかけてください。調べ物も頼めます";
			if (["closed", "error"].includes(value)) {
				for (const timer of testTimers) Timer.clear(timer);
				testTimers.clear();
			}
			trace(`LIVE state ${value}\n`);
			invalidate();
		},
		onTranscript(fragment) {
			if (fragment.role === "user") userText = (userText + fragment.delta).slice(-600);
			else assistantText = (assistantText + fragment.delta).slice(-600);
			trace(`LIVE transcript ${JSON.stringify(fragment)}\n`);
			invalidate();
		},
		onEvent(event) {
			if (event.usage?.seconds !== undefined) usage = event.usage.seconds;
			// Log event types and usage only; response payloads may contain user data.
			trace(`LIVE event ${event.type}${event.type === "response.event" ? ` ${event.event?.type ?? ""}` : ""}\n`);
		},
		onError(error) { note = `${error.code ?? "error"}: ${error.message}`; trace(`LIVE error ${error.code} ${error.stage} ${error.status ?? ""} ${error.message}\n`); invalidate(); }
	});
	conversation.setVolume(volume);
	try {
		await conversation.connect();
		trace(`LIVE session ${conversation.sessionId}\n`);
		testCycle++;
		const duration = testCycle > 1 ? (config.testRepeatSeconds ?? config.testSeconds) : config.testSeconds;
		if (duration > 0) scheduleTest(() => void close(), duration * 1000);
		if (config.testMute) {
			scheduleTest(() => void toggleMute(), 10000);
			scheduleTest(() => void toggleMute(), 15000);
		}
	}
	catch {}
}
async function close() {
	if (!conversation) return;
	try {
		const result = await conversation.close();
		note = result.finalized ? "会話を終了しました" : "終了を確認できませんでした";
		trace(`LIVE closed ${JSON.stringify(result)}\n`);
		trace(`LIVE released ${JSON.stringify(conversation.stats)}\n`);
		if (config.autoStart && result.finalized && testCycle < (config.testCycles ?? 1))
			Timer.set(() => void start(), 5000);
	}
	catch (error) { note = error.message; }
	invalidate();
}
async function toggleMute() {
	if (busy || state !== "connected") return;
	busy = true;
	try { await conversation.setMuted(!muted); trace(`LIVE muted ${conversation.muted}\n`); }
	catch {}
	muted = conversation.muted;
	busy = false;
	invalidate();
}
function drawLines(port, text, color, y, lines) {
	// Keep each speaker in its own pane; transcript deltas are not turn boundaries.
	const width = port.width - 80, all = [], characters = Array.from(text);
	let line = "";
	for (const c of characters) {
		if (c === "\n" || japanese.measure(line + c).width > width) { all.push(line); line = c === "\n" ? "" : c; }
		else line += c;
	}
	if (line) all.push(line);
	for (const value of all.slice(-lines)) { port.drawString(value, japanese, color, 40, y, width, 40); y += 40; }
}
class ViewBehavior extends Behavior {
	onCreate(port) { view = port; }
	onDraw(port) {
		port.fillColor("#101A24", 0, 0, port.width, port.height);
		port.drawString("GPT-Live-1 / M5Tab", title, "white", 36, 22, 650, 44);
		port.drawString(`${states[state]}  ${Math.round(usage)}秒`, japanese, "#8BDCC8", 780, 22, 450, 44);
		port.drawString(note, japanese, "#BDCDD9", 36, 82, port.width - 72, 44);
		port.drawString("あなた", japanese, "#8AC9F0", 36, 146, 250, 44);
		drawLines(port, userText, "#D8EDFB", 192, 3);
		port.drawString("アシスタント", japanese, "#83DAC5", 36, 328, 300, 44);
		drawLines(port, assistantText, "white", 378, 4);
		const labels = [state === "connected" || state === "connecting" ? "終了" : "開始", muted ? "マイク再開" : "ミュート", "音量 −", "音量 ＋"];
		for (let i = 0; i < 4; i++) {
			const x = 32 + i * (port.width - 64) / 4;
			port.fillColor(i === 1 && muted ? "#77513B" : "#26485D", x, port.height - 102, (port.width - 96) / 4, 70);
			port.drawString(labels[i], japanese, "white", x + 24, port.height - 85, 260, 44);
		}
	}
	onTouchEnded(port, id, x, y) {
		if (y < port.height - 102 || y >= port.height - 32 || x < 32) return;
		const button = Math.floor((x - 32) / ((port.width - 64) / 4));
		if (button > 3 || x >= 32 + button * (port.width - 64) / 4 + (port.width - 96) / 4) return;
		if (button === 0) { if (state === "closing") return; void ((state === "connected" || state === "connecting") ? close() : start()); }
		else if (button === 1) void toggleMute();
		else if (button === 2 || button === 3) {
			volume = Math.max(0, Math.min(1, volume + (button === 2 ? -0.1 : 0.1)));
			conversation?.setVolume(volume);
			note = `音量 ${Math.round(volume * 100)}%`;
			invalidate();
		}
	}
}
const UI = Application.template($ => ({contents: [Port($, {left: 0, right: 0, top: 0, bottom: 0, active: true, Behavior: ViewBehavior})]}));
const application = new UI(null, {commandListLength: 32768, displayListLength: 32768, touchCount: config.touchCount ?? 1});
wifi = new WiFi({onChanged: networkChanged});
async function synchronizeClock() {
	if (Date.now() >= Date.UTC(2026, 0, 1)) { clockReady = true; return; }
	clockPromise ??= new Promise((resolve, reject) => {
		const ntp = new device.network.ntp.client.io({...device.network.ntp.client, servers: ["time.cloudflare.com", "pool.ntp.org"]});
		const timeout = Timer.set(() => { ntp.close(); reject(new Error("時刻を取得できませんでした")); }, 15000);
		ntp.getTime((error, value) => {
			Timer.clear(timeout); ntp.close();
			if (error) reject(new Error("時刻を取得できませんでした"));
			else { Time.set(value / 1000); clockReady = true; resolve(); }
		});
	});
	try { await clockPromise; } finally { clockPromise = undefined; }
}
async function networkChanged() {
	trace(`LIVE Wi-Fi connection ${wifi.connection}\n`);
	if (wifi.connection >= 500) {
		note = "時刻を確認しています"; invalidate();
		trace("LIVE Wi-Fi ready\n");
		try { await synchronizeClock(); } catch (error) { note = error.message; invalidate(); return; }
		note = "開始を押して話しかけてください";
		if (config.autoStart && !autoStarted) {
			autoStarted = true;
			using settings = keyValue.open({path: "live-test", format: "string"});
			if (settings.read("attempt") !== config.testRunId) {
				settings.write("attempt", config.testRunId);
				void start();
			}
			else note = "自動試験は実行済みです。開始を押すと接続します";
		}
	}
	else if (wifi.connection <= 200) {
		note = "Wi-Fiに接続できません";
		if (conversation && state === "connected") void close();
	}
	invalidate();
}
if (wifi.connection >= 500) networkChanged();
else wifi.connect({SSID: config.ssid, password: config.password});
Timer.repeat(() => {
	if (state === "connected") trace(`LIVE stats ${JSON.stringify({...conversation.stats, wifiConnection: wifi.connection, wifiRSSI: wifi.RSSI})}\n`);
	invalidate();
}, 5000);
export default application;
