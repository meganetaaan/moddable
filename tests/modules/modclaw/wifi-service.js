/*---
description:
flags: [module, async]
---*/

import {NVS_KEYS} from "../../../contributed/modclaw/modules/config.js";
import {WiFiService} from "../../../contributed/modclaw/modules/wifiService.js";

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
}

class FakeWiFi {
	static Mode = {station: 1};
	static connected = "connect";
	static gotIP = "gotIP";
	static lostIP = "lostIP";
	static disconnected = "disconnect";
	static mode = 0;
	static scanResults = [];
	static lastInstance = null;

	static scan(options, callback) {
		for (const result of FakeWiFi.scanResults)
			callback(result);
		callback(null);
	}

	constructor(dictionary, callback) {
		this.dictionary = dictionary;
		this.callback = callback;
		FakeWiFi.lastInstance = this;
	}

	close() {
		this.closed = true;
	}
}

class FakeNet {
	constructor(values = {}) {
		this.values = values;
	}

	get(name) {
		return this.values[name];
	}
}

const timer = new FakeTimer;
const store = new Map([
	[NVS_KEYS.WIFI_SSID, "Trident"],
	[NVS_KEYS.WIFI_PASS, "topsecret123"],
]);
const net = new FakeNet;
const wifi = new WiFiService({
	WiFi: FakeWiFi,
	Net: net,
	timer,
	store,
});

assert.sameValue(wifi.isProvisioned(), true);

const connecting = wifi.connectFromStore();
net.values.SSID = "Trident";
FakeWiFi.lastInstance.callback(FakeWiFi.connected);
net.values.IP = "10.0.0.24";
net.values.RSSI = -77;
FakeWiFi.lastInstance.callback(FakeWiFi.gotIP);
assert.sameValue(await connecting, true);
assert(wifi.statusText({safeMode: false}).includes("ssid=Trident"));
assert(wifi.statusText({safeMode: false}).includes("ip=10.0.0.24"));

FakeWiFi.scanResults = [
	{ssid: "Trident", rssi: -50},
	{ssid: "Guest", rssi: -70},
	{ssid: "Trident", rssi: -55},
];
const scanText = await wifi.scanText();
assert(scanText.includes("2 APs visible"));
assert(scanText.includes("Trident(-50)"));
assert(scanText.includes("Guest(-70)"));

wifi.close();
assert(wifi.statusText({safeMode: true}).includes("safe_mode=yes"));
