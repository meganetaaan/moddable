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
import WiFi from "embedded:network/interface/wifi";
import config from "mc/config";
import Tab5WHIP from "tab5/whip";

const whip = new Tab5WHIP({url: config.whipURL, token: config.whipToken});
let started = false;
let wifi;
let statusPort;

const background = "#111820";
const header = "#071018";
const panel = "#22303D";
const text = "#F5F7FA";
const muted = "#A9B5C0";
const titleStyle = new Style({font:"semibold 20px Open Sans", horizontal:"left"});
const bodyStyle = new Style({font:"18px Open Sans", horizontal:"left"});
const statusNames = ["STOPPED", "STARTING", "SIGNALING", "CONNECTED", "FAILED", "DISCONNECTED"];

function start() {
	if (started)
		return;
	whip.start();
	started = true;
}

function stop() {
	if (!started)
		return;
	whip.stop();
	started = false;
}

function connectionName(connection) {
	if (connection >= 500)
		return "IP READY";
	if (connection >= 400)
		return "ASSOCIATED";
	if (connection >= 300)
		return "AUTHENTICATING";
	if (connection >= 200)
		return "DISCONNECTED";
	return "OFFLINE";
}

function statusName(status) {
	return statusNames[status] ?? `STATE ${status}`;
}

function drawStatus(port) {
	const margin = 28;
	const lineHeight = 30;
	const lines = [
		`Wi-Fi: ${wifi ? connectionName(wifi.connection) : "NOT CONFIGURED"}`,
		`SSID: ${wifi?.SSID ?? config.ssid ?? "-"}`,
		`IP: ${wifi?.address ?? "-"}`,
		`WHIP: ${statusName(whip.status)}`,
		`Error: ${whip.error || "none"}`,
		`Target: ${config.whipURL || "-"}`,
		"Video: H.264 1280x720 @ 30 fps"
	];
	port.fillColor(background, 0, 0, port.width, port.height);
	port.fillColor(header, 0, 0, port.width, 62);
	port.drawString("TAB5 WHIP DEBUG", titleStyle, text, margin, 18, port.width - margin * 2, 32);
	let y = 92;
	for (const line of lines) {
		port.fillColor(panel, margin - 8, y - 4, port.width - margin * 2 + 16, lineHeight);
		port.drawString(line, bodyStyle, muted, margin, y, port.width - margin * 2, lineHeight);
		y += lineHeight + 8;
	}
}

if (!config.ssid || !config.whipURL) {
	trace("Set ssid, password, and whipURL in mcconfig arguments.\n");
}
else {
	wifi = new WiFi({});
	if (wifi.connection >= 500)
		start();
	else
		wifi.connect({
			SSID: config.ssid,
			password: config.password,
			onChanged() {
				if (this.connection >= 500)
					start();
				else if (this.connection <= 200)
					stop();
			}
		});
}

Timer.repeat(() => {
	if (started)
		whip.query();
}, 2000);

Timer.repeat(() => statusPort?.invalidate(), 500);

class StatusBehavior extends Behavior {
	onCreate(port) { statusPort = port; }
	onDraw(port) { drawStatus(port); }
}

const StatusApplication = Application.template($ => ({
	contents: [Port($, {left:0, right:0, top:0, bottom:0, Behavior:StatusBehavior})]
}));

export default new StatusApplication(null, {commandListLength:4096, displayListLength:4096, touchCount:0});
