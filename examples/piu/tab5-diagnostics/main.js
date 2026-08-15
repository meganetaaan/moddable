/*
 * Copyright (c) 2026  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

import {} from "piu/MC";
import AudioIn from "embedded:io/audio/in";
import AudioOut from "embedded:io/audio/out";
import Camera from "embedded:io/image/in/camera";
import WiFi from "embedded:network/interface/wifi";
import config from "mc/config";
import Timer from "timer";

const NOT_RUN = "NOT RUN";
const RUNNING = "RUNNING";
const WAIT = "WAIT";
const PASS = "PASS";
const FAIL = "FAIL";

const colors = Object.freeze({
	background: "#111820",
	panel: "#22303D",
	header: "#071018",
	button: "#31506B",
	text: "#F5F7FA",
	muted: "#A9B5C0",
	[NOT_RUN]: "#77838E",
	[RUNNING]: "#2D9CDB",
	[WAIT]: "#F2C94C",
	[PASS]: "#27AE60",
	[FAIL]: "#EB5757"
});

const titleStyle = new Style({font:"600 28px Open Sans", color:colors.text, horizontal:"left"});
const bodyStyle = new Style({font:"20px Open Sans", color:colors.text, horizontal:"left"});
const centerStyle = new Style({font:"20px Open Sans", color:colors.text, horizontal:"center"});

const definitions = Object.freeze([
	["Display", "displayEnter"],
	["5-point Touch", "touchEnter"],
	["Camera", "cameraEnter"],
	["Audio", "audioEnter"],
	["Wi-Fi", "wifiEnter"],
	["RTC + Sensors", "sensorsEnter"],
	["microSD", "sdEnter"],
	["USB HID", "usbEnter"],
	["Port A I2C", "i2cEnter"],
	["Port B G52→G17", "portBEnter"],
	["Port C UART", "portCEnter"],
	["M-Bus SPI", "spiEnter"],
	["RS-485", "rs485Enter"],
	["Power", "powerEnter"],
	["RTC Wake", "wakeEnter"],
	["Capabilities", "capabilitiesEnter"]
]);

function errorMessage(error) { return error?.message ?? String(error); }
function hex(buffer) { return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join(" "); }

class Diagnostics {
	constructor() {
		this.tests = definitions.map(([name, enter]) => ({name, enter, status:NOT_RUN}));
		this.page = -1;
		this.lines = [];
		this.buttons = [];
		this.resources = [];
		this.timers = [];
		this.touches = new Map();
		this.clearWakeTimer();
		try {
			this.power = new device.power.io({...device.power, speaker:true});
		}
		catch (error) {
			this.tests[13].status = FAIL;
			trace(`Power initialization failed: ${errorMessage(error)}\n`);
		}
	}

	bind(application) {
		this.application = application;
		this.invalidate();
	}

	clearWakeTimer() {
		let rtc;
		try {
			rtc = new device.rtc.io(device.rtc);
			rtc.configure({timer:0});
		}
		catch (error) {
			this.tests[14].status = FAIL;
			trace(`RTC timer clear failed: ${errorMessage(error)}\n`);
		}
		finally {
			rtc?.close();
		}
	}

	show(index) {
		this.cleanup();
		this.page = index;
		this.lines = [];
		this.buttons = [];
		try {
			this[this.tests[index].enter]();
		}
		catch (error) {
			this.fail(error);
		}
		this.invalidate();
	}

	back() {
		this.cleanup();
		this.page = -1;
		this.invalidate();
	}

	cleanup() {
		this.onLeave?.();
		this.onLeave = undefined;
		for (const timer of this.timers)
			Timer.clear(timer);
		this.timers.length = 0;
		for (let i = this.resources.length - 1; i >= 0; i--) {
			try {
				this.resources[i]?.close();
			}
			catch {
			}
		}
		this.resources.length = 0;
		this.touches.clear();
		if (this.PREVIEW) {
			this.PREVIEW.buffer = undefined;
			this.PREVIEW.visible = false;
		}
	}

	shutdown() {
		this.cleanup();
		this.power?.close();
		this.power = undefined;
	}

	own(resource) { this.resources.push(resource); return resource; }

	after(callback, delay) { this.timers.push(Timer.set(callback, delay)); }
	every(callback, delay) { this.timers.push(Timer.repeat(callback, delay)); }

	set(status, ...lines) {
		const test = this.tests[this.page];
		if (test.status !== status)
			trace(`${test.name}: ${status}\n`);
		test.status = status;
		if (lines.length)
			this.lines = lines;
		this.invalidate();
	}

	update(...lines) { this.lines = lines; this.invalidate(); }

	pass() { this.set(PASS, ...this.lines); }

	fail(error = "Marked failed") {
		this.set(FAIL, errorMessage(error));
		trace(`${this.tests[this.page].name}: ${errorMessage(error)}\n`);
	}

	invalidate() { this.UI?.invalidate(); }

	draw(port) {
		if (this.page < 0)
			return this.drawDashboard(port);

		const camera = 2 === this.page;
		if (!camera) {
			if (0 === this.page)
				this.drawDisplayPattern(port);
			else
				port.fillColor(colors.background, 0, 0, port.width, port.height);
		}
		port.fillColor(colors.header, 0, 0, port.width, 68);
		port.drawString("‹ BACK", bodyStyle, colors.text, 20, 18, 130, 36);
		port.drawString(this.tests[this.page].name, titleStyle, colors.text, 170, 12, 760, 46);
		port.fillColor(colors[this.tests[this.page].status], port.width - 190, 14, 170, 40);
		port.drawString(this.tests[this.page].status, centerStyle, colors.header, port.width - 190, 16, 170, 34);

		if (camera)
			port.fillColor(colors.header, 20, 82, 570, 146);
		if (0 !== this.page) {
			let y = 88;
			for (const line of this.lines) {
				port.drawString(line, bodyStyle, colors.text, 36, y, port.width - 72, 28);
				y += 29;
			}
		}
		if (1 === this.page)
			this.drawTouches(port);
		else if (3 === this.page)
			this.drawAudio(port);

		this.drawButtons(port);
	}

	drawDashboard(port) {
		port.fillColor(colors.background, 0, 0, port.width, port.height);
		port.drawString("M5Stack Tab5 Diagnostics", titleStyle, colors.text, 20, 12, 700, 44);
		port.drawString("Tap a tile. Results are session-only; run RTC Wake last.", bodyStyle, colors.muted, 720, 16, port.width - 740, 34);
		const left = 16;
		const top = 66;
		const gap = 10;
		const width = Math.idiv(port.width - (left * 2) - (gap * 3), 4);
		const height = Math.idiv(port.height - top - 16 - (gap * 3), 4);
		for (let index = 0; index < this.tests.length; index++) {
			const column = index & 3;
			const row = index >> 2;
			const x = left + (column * (width + gap));
			const y = top + (row * (height + gap));
			const test = this.tests[index];
			port.fillColor(colors.panel, x, y, width, height);
			port.fillColor(colors[test.status], x, y, 8, height);
			port.drawString(test.name, bodyStyle, colors.text, x + 22, y + 24, width - 34, 32);
			port.drawString(test.status, bodyStyle, colors[test.status], x + 22, y + height - 45, width - 34, 28);
		}
	}

	drawDisplayPattern(port) {
		const areaTop = 68;
		const areaBottom = port.height - 100;
		const pattern = this.displayPatterns[this.displayPattern];
		port.fillColor(pattern.color, 0, areaTop, port.width, areaBottom - areaTop);
		if ("Grid" === pattern.name) {
			for (let x = 0; x < port.width; x += 80)
				port.fillColor((x % 160) ? "#FFFFFF" : "#FF0000", x, areaTop, 2, areaBottom - areaTop);
			for (let y = areaTop; y < areaBottom; y += 80)
				port.fillColor((y % 160) ? "#FFFFFF" : "#00FF00", 0, y, port.width, 2);
		}
		port.fillColor(colors.header, 20, 82, 470, 42);
		port.drawString(`${pattern.name}; brightness ${Math.round(this.displayBrightness * 100)}%`, bodyStyle, colors.text, 34, 88, 440, 30);
	}

	drawTouches(port) {
		for (const {x, y} of this.touches.values()) {
			port.fillColor("#FFFFFF", x - 18, y - 3, 36, 6);
			port.fillColor("#FFFFFF", x - 3, y - 18, 6, 36);
		}
	}

	drawAudio(port) {
		const levels = this.audioLevels ?? [0, 0];
		for (let channel = 0; channel < 2; channel++) {
			const y = 420 + (channel * 70);
			port.drawString(`MIC ${channel + 1}`, bodyStyle, colors.text, 40, y, 100, 32);
			port.fillColor(colors.panel, 150, y, port.width - 200, 32);
			port.fillColor(colors[RUNNING], 150, y, Math.min(port.width - 200, levels[channel] >> 3), 32);
		}
	}

	drawButtons(port) {
		if (!this.buttons.length)
			return;
		const gap = 12;
		const left = 16;
		const y = port.height - 84;
		const width = Math.idiv(port.width - (left * 2) - (gap * (this.buttons.length - 1)), this.buttons.length);
		for (let index = 0; index < this.buttons.length; index++) {
			const x = left + (index * (width + gap));
			port.fillColor(colors.button, x, y, width, 66);
			port.drawString(this.buttons[index][0], centerStyle, colors.text, x, y + 16, width, 34);
		}
	}

	touchBegan(id, x, y) {
		if (1 !== this.page)
			return;
		this.touches.set(id, {x, y});
		this.touchMaximum = Math.max(this.touchMaximum, this.touches.size);
		if (this.touchMaximum >= 5)
			this.set(PASS, "Five simultaneous contacts detected.", "Lift all fingers, then tap BACK.");
		else
			this.update(`Maximum simultaneous contacts: ${this.touchMaximum} / 5`, "Place five fingers on the display at once.");
	}

	touchMoved(id, x, y) {
		if (1 === this.page) {
			this.touches.set(id, {x, y});
			this.invalidate();
		}
	}

	touchEnded(id, x, y) {
		if (1 === this.page) {
			this.touches.delete(id);
			this.invalidate();
			if (!this.touches.size && (y < 68) && (x < 150))
				this.back();
			return;
		}
		if (this.page < 0) {
			const index = this.tileAt(x, y);
			if (index >= 0)
				this.show(index);
			return;
		}
		if ((y < 68) && (x < 150))
			return this.back();
		if ((y < (screen.height - 84)) || !this.buttons.length)
			return;
		const index = Math.min(this.buttons.length - 1, Math.idiv(x * this.buttons.length, screen.width));
		const action = this.buttons[index][1];
		if (action)
			this[action]();
	}

	tileAt(x, y) {
		const left = 16;
		const top = 66;
		const gap = 10;
		if ((x < left) || (y < top))
			return -1;
		const width = Math.idiv(screen.width - (left * 2) - (gap * 3), 4);
		const height = Math.idiv(screen.height - top - 16 - (gap * 3), 4);
		const column = Math.idiv(x - left, width + gap);
		const row = Math.idiv(y - top, height + gap);
		if ((column > 3) || (row > 3) || (((x - left) % (width + gap)) >= width) || (((y - top) % (height + gap)) >= height))
			return -1;
		return (row * 4) + column;
	}

	displayEnter() {
		this.displayPatterns = [
			{name:"Red", color:"#FF0000"}, {name:"Green", color:"#00FF00"},
			{name:"Blue", color:"#0000FF"}, {name:"White", color:"#FFFFFF"},
			{name:"Black", color:"#000000"}, {name:"Grid", color:"#202020"}
		];
		this.displayPattern = 0;
		this.displayBrightnesses = [0.1, 0.5, 1];
		this.displayBrightnessIndex = 0;
		this.displayBrightness = 0.1;
		this.displaySavedBrightness = screen.configuration.brightness;
		screen.configure({brightness:this.displayBrightness});
		this.buttons = [["Next pattern", "displayNext"], ["Brightness", "displayNextBrightness"], ["PASS", "pass"], ["FAIL", "fail"]];
		this.set(RUNNING);
		this.onLeave = () => screen.configure({brightness:this.displaySavedBrightness});
	}

	displayNext() {
		this.displayPattern = (this.displayPattern + 1) % this.displayPatterns.length;
		this.invalidate();
	}

	displayNextBrightness() {
		this.displayBrightnessIndex = (this.displayBrightnessIndex + 1) % this.displayBrightnesses.length;
		this.displayBrightness = this.displayBrightnesses[this.displayBrightnessIndex];
		screen.configure({brightness:this.displayBrightness});
		this.invalidate();
	}

	touchEnter() {
		this.touchMaximum = 0;
		this.set(RUNNING, "Maximum simultaneous contacts: 0 / 5", "Place five fingers on the display at once.");
	}

	cameraEnter() {
		this.cameraChecks = {upright:false, color:false, stable:false};
		this.cameraFrames = 0;
		this.buttons = [["Upright", "cameraUpright"], ["Color OK", "cameraColor"], ["No tearing", "cameraStable"], ["FAIL", "fail"]];
		let frame;
		const imageType = screen.pixelFormat;
		let {width, height} = screen;
		const camera = this.own(new Camera({
			width,
			height,
			rotation:config.rotation,
			imageType,
			format:"buffer/disposable",
			onReadable: () => {
				frame?.close();
				frame = camera.read();
				if (!frame)
					return;
				this.cameraFrameBytes = frame.byteLength;
				this.cameraFrames++;
				this.PREVIEW.buffer = frame;
				if (1 === this.cameraFrames || !(this.cameraFrames % 30))
					this.updateCameraLines();
			}
		}));
		width = camera.width;
		height = camera.height;
		const rotation = camera.configuration.rotation ?? 0;
		if ((90 === rotation) || (270 === rotation))
			[width, height] = [height, width];
		this.cameraSize = `${width} × ${height}, rotation ${rotation}°`;
		this.PREVIEW.visible = true;
		camera.start();
		this.set(RUNNING);
		this.updateCameraLines();
		this.onLeave = () => {
			this.PREVIEW.buffer = undefined;
			frame?.close();
			frame = undefined;
		};
	}

	updateCameraLines() {
		this.update(
			`Capture: ${this.cameraSize}`,
			`Frames: ${this.cameraFrames}; latest buffer: ${this.cameraFrameBytes ?? 0} bytes`,
			`Checks: upright ${this.cameraChecks.upright}; color ${this.cameraChecks.color}; stable ${this.cameraChecks.stable}`,
			"Confirm upright orientation, neutral color, and stable tear-free updates."
		);
	}

	cameraUpright() { this.cameraConfirm("upright"); }
	cameraColor() { this.cameraConfirm("color"); }
	cameraStable() { this.cameraConfirm("stable"); }
	cameraConfirm(name) {
		this.cameraChecks[name] = true;
		this.updateCameraLines();
		if (Object.values(this.cameraChecks).every(Boolean))
			this.set(PASS, ...this.lines);
	}

	audioEnter() {
		this.audioLevels = [0, 0];
		this.audioReads = 0;
		this.audioSavedSpeaker = this.power?.configuration.speaker;
		this.power?.configure({speaker:true});
		this.buttons = [["Play 1 kHz", "audioTone"], ["PASS", "pass"], ["FAIL", "fail"]];
		const model = this;
		const input = this.own(new AudioIn({
			channels:2,
			onReadable(size) {
				if (!model.audioBuffer || (model.audioBuffer.byteLength !== size))
					model.audioBuffer = new SharedArrayBuffer(size);
				this.read(model.audioBuffer);
				const samples = new Int16Array(model.audioBuffer);
				let left = 0, right = 0;
				for (let index = 0; index < samples.length; index += 2) {
					left += Math.abs(samples[index]);
					right += Math.abs(samples[index + 1]);
				}
				model.audioLevels = [Math.idiv(left, samples.length >> 1), Math.idiv(right, samples.length >> 1)];
				if (!(++model.audioReads & 7))
					model.updateAudioLines();
			}
		}));
		input.start();
		this.every(() => this.updateAudioLines(), 500);
		this.set(RUNNING);
		this.updateAudioLines();
		this.onLeave = () => {
			if (undefined !== this.audioSavedSpeaker)
				this.power?.configure({speaker:this.audioSavedSpeaker});
		};
	}

	updateAudioLines() {
		this.update(
			`Input: 48 kHz, 16-bit, 2-channel; levels ${this.audioLevels[0]} / ${this.audioLevels[1]}`,
			`Headphones detected: ${this.power ? this.power.headphones : "unavailable"}`,
			"Speak near both microphones, then play the low-volume test tone."
		);
	}

	audioTone() {
		if (this.audioOutput)
			return;
		const samples = new Int16Array(480);
		for (let index = 0; index < samples.length; index++)
			samples[index] = Math.round(Math.sin((index * Math.PI) / 24) * 3000);
		const bytes = new Uint8Array(samples.buffer);
		const output = this.audioOutput = this.own(new AudioOut({
			onWritable(size) {
				while (size) {
					const use = Math.min(size, bytes.byteLength);
					this.write(bytes.subarray(0, use));
					size -= use;
				}
			}
		}));
		output.volume = 0.2;
		output.start();
		this.after(() => {
			output.close();
			this.audioOutput = undefined;
		}, 1000);
	}

	wifiEnter() {
		this.wifiSavedPower = this.power?.configuration.wifi;
		this.power?.configure({wifi:true});
		this.buttons = [["Rescan", "wifiRescan"], ["PASS", "pass"], ["FAIL", "fail"]];
		this.onLeave = () => {
			this.closeWiFi();
			if (undefined !== this.wifiSavedPower)
				this.power?.configure({wifi:this.wifiSavedPower});
		};
		this.startWiFi();
	}

	startWiFi() {
		this.wifiPoints = new Map();
		const wifi = this.wifi = new WiFi({
			onChanged: () => {
				if (wifi !== this.wifi) return;
				if (wifi.connection >= 500)
					return void this.set(PASS, ...this.lines, `Connected: ${wifi.address}`);
				if (wifi.connection <= 200)
					this.set(FAIL, ...this.lines, "Wi-Fi connection failed.");
			}
		});
		this.wifiScanning = true;
		this.set(RUNNING, "Scanning for access points…");
		wifi.scan({
			onFound: ap => {
				const previous = this.wifiPoints.get(ap.SSID);
				if (!previous || ((previous.RSSI ?? -200) < (ap.RSSI ?? -200)))
					this.wifiPoints.set(ap.SSID, ap);
			},
			onComplete: () => {
				if (wifi !== this.wifi)
					return;
				this.wifiScanning = false;
				const points = Array.from(this.wifiPoints.values()).sort((a, b) => (b.RSSI ?? -200) - (a.RSSI ?? -200));
				this.lines = [`Scan found ${points.length} network(s).`, ...points.slice(0, 8).map(ap => `${ap.SSID || "<hidden>"}: ${ap.RSSI ?? "?"} dBm, channel ${ap.channel}`)];
				if (config.wifiSSID && config.wifiPassword)
					this.connectWiFi(wifi);
				else
					this.set(WAIT, ...this.lines, "No build-time wifiSSID/wifiPassword; scan only. Press PASS to accept.");
			}
		});
	}

	connectWiFi(wifi) {
		this.set(RUNNING, ...this.lines, `Connecting to ${config.wifiSSID}…`);
		wifi.connect({
			SSID:config.wifiSSID,
			password:config.wifiPassword
		});
	}

	wifiRescan() {
		if (this.wifiScanning)
			return;
		this.closeWiFi();
		this.startWiFi();
	}

	closeWiFi() {
		const wifi = this.wifi;
		this.wifi = undefined;
		if (!wifi)
			return;
		try { wifi.disconnect(); }
		catch {}
		try { wifi.close(); }
		catch {}
	}

	sensorsEnter() {
		this.sensorFailures = [];
		try {
			this.rtc = this.own(new device.rtc.io(device.rtc));
			this.rtcStart = this.rtc.time;
		}
		catch (error) {
			this.sensorFailures.push(`RTC: ${errorMessage(error)}`);
		}
		try {
			this.energy = this.own(new device.sensor.Power());
		}
		catch (error) {
			this.sensorFailures.push(`INA226: ${errorMessage(error)}`);
		}
		try {
			this.imu ??= new device.sensor.IMU();
		}
		catch (error) {
			this.sensorFailures.push(`BMI270: ${errorMessage(error)}`);
		}
		this.buttons = [["PASS", "pass"], ["FAIL", "fail"]];
		const sample = () => {
			try { this.sampleSensors(); }
			catch (error) { this.fail(error); }
		};
		this.every(sample, 500);
		sample();
	}

	sampleSensors() {
		let rtcLine = "RTC unavailable";
		let rtcOK = false;
		if (this.rtc) {
			const now = this.rtc.time;
			rtcLine = undefined === now ? "RTC time invalid" : `RTC: ${new Date(now).toISOString()}`;
			rtcOK = (undefined !== this.rtcStart) && (now >= (this.rtcStart + 1000));
		}
		let imuLine = "BMI270 unavailable";
		let imuOK = false;
		if (this.imu) {
			const sample = this.imu.sample();
			const a = sample.accelerometer;
			const g = sample.gyroscope;
			imuOK = !!a && !!g && [a.x, a.y, a.z, g.x, g.y, g.z].every(Number.isFinite);
			if (a && g)
				imuLine = `BMI270 accel ${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)} m/s²; gyro ${g.x.toFixed(1)}, ${g.y.toFixed(1)}, ${g.z.toFixed(1)} °/s`;
		}
		let powerLine = "INA226 unavailable";
		let powerOK = false;
		if (this.energy) {
			const sample = this.energy.sample();
			powerOK = [sample.voltage, sample.current, sample.power, sample.shuntVoltage].every(Number.isFinite);
			powerLine = `INA226 ${sample.voltage.toFixed(3)} V, ${sample.current.toFixed(3)} A, ${sample.power.toFixed(3)} W`;
		}
		this.update(rtcLine, imuLine, powerLine, ...this.sensorFailures);
		if (this.sensorFailures.length)
			this.set(FAIL, ...this.lines);
		else if (rtcOK && imuOK && powerOK)
			this.set(PASS, ...this.lines);
		else
			this.set(RUNNING, ...this.lines);
	}

	sdEnter() {
		this.buttons = [["Run again", "sdRun"], ["FAIL", "fail"]];
		this.sdRun();
	}

	async sdRun() {
		this.set(RUNNING, "Writing and verifying a unique 4 KiB temporary file…");
		const path = `tab5-diagnostics-${Date.now()}.bin`;
		let files, deleted = false;
		const expected = new Uint8Array(4096);
		for (let index = 0; index < expected.length; index++)
			expected[index] = (index * 73 + 19) & 0xFF;
		try {
			files = (await import("embedded:storage/files")).default;
			{
				using file = files.openFile({path, mode:"w+"});
				file.write(expected, 0);
				file.flush();
				const actual = new Uint8Array(file.read(expected.byteLength, 0));
				if (actual.some((value, index) => value !== expected[index]))
					throw new Error("readback mismatch");
			}
			if (!files.status(path).isFile())
				throw new Error("temporary file missing");
			if (!files.delete(path))
				throw new Error("temporary file delete failed");
			deleted = true;
			this.set(PASS, "4 KiB write/read/compare passed.", `Deleted ${path}`);
		}
		catch (error) {
			this.fail(error);
		}
		finally {
			try { if (!deleted) files?.delete(path); }
			catch {}
		}
	}

	usbEnter() {
		this.usbSeen = {mouse:false, keyboard:false};
		this.buttons = [["Mouse", "usbMouse"], ["Keyboard", "usbKeyboard"], ["PASS", "pass"], ["FAIL", "fail"]];
		this.onLeave = () => this.closeUSB();
		this.usbOpen("mouse");
	}

	usbMouse() { this.usbOpen("mouse"); }
	usbKeyboard() { this.usbOpen("keyboard"); }
	usbOpen(protocol) {
		this.closeUSB();
		const model = this;
		const hid = this.usb = new device.USBHID.default.io({
			...device.USBHID.default,
			protocol,
			onReadable(reports) {
				while (reports--) {
					const report = this.read();
					model.usbSeen[this.protocol] = true;
					model.usbReport = `${this.protocol}: ${hex(report)}`;
				}
				model.updateUSB();
			},
			onError(error) {
				model.fail(`USB HID error ${error}`);
			}
		});
		this.updateUSB();
	}

	updateUSB() {
		this.update(
			`Mode: ${this.usb?.protocol}; connected: ${this.usb?.connected ?? false}`,
			`Seen mouse: ${this.usbSeen.mouse}; keyboard: ${this.usbSeen.keyboard}`,
			`Latest raw report: ${this.usbReport ?? "none"}`,
			"Switch modes after changing the device attached to USB-A."
		);
		this.set(this.usbSeen.mouse && this.usbSeen.keyboard ? PASS : WAIT, ...this.lines);
	}

	closeUSB() {
		try { this.usb?.close(); }
		catch {}
		this.usb = undefined;
	}

	i2cEnter() {
		this.buttons = [["Rescan", "i2cRescan"], ["PASS", "pass"], ["FAIL", "fail"]];
		this.onLeave = () => {
			if (this.i2cScan)
				this.i2cScan.cancelled = true;
		};
		this.startI2CScan();
	}

	i2cRescan() {
		if (!this.i2cScan?.running)
			this.startI2CScan();
	}

	startI2CScan() {
		const scan = this.i2cScan = {address:0x08, found:[], running:true, cancelled:false};
		this.set(RUNNING, "Scanning Port A addresses 0x08–0x77 asynchronously…", "Connect an I2C device to Port A.");
		const next = () => {
			if (scan.cancelled)
				return;
			if (scan.address > 0x77) {
				scan.running = false;
				const found = scan.found.map(address => `0x${address.toString(16).padStart(2, "0")}`).join(", ");
				return this.set(scan.found.length ? PASS : WAIT, `Found ${scan.found.length} device(s): ${found || "none"}`, "No device is also a valid electrical state; press PASS to accept.");
			}
			const address = scan.address++;
			let io;
			try {
				io = new device.I2C.default.io.Async({...device.I2C.default, address, hz:400_000});
				io.write(new Uint8Array(0), error => {
					if (!error)
						scan.found.push(address);
					io.close(() => next());
				});
			}
			catch (error) {
				scan.running = false;
				try { io?.close(); }
				catch {}
				this.fail(error);
			}
		};
		next();
	}

	portBEnter() {
		this.buttons = [["Run", "portBRun"], ["PASS", "pass"], ["FAIL", "fail"]];
		this.set(WAIT, "Wire Port B G52 (output) to G17 (analog input), then tap Run.", "The test drives 0 V and 3.3 V and checks both ADC levels.");
	}

	portBRun() {
		if (this.portBRunning)
			return;
		this.portBRunning = true;
		const output = this.own(new device.io.Digital({pin:device.pin.portBOut, mode:device.io.Digital.Output, initialValue:0}));
		const input = this.own(new device.Analog.default.io(device.Analog.default));
		this.set(RUNNING, "Sampling low and high levels…");
		this.after(() => {
			const low = input.read();
			output.write(1);
			this.after(() => {
				const high = input.read();
				const maximum = (2 ** input.resolution) - 1;
				this.set((low < (maximum * 0.25)) && (high > (maximum * 0.75)) ? PASS : FAIL,
					`ADC low ${low}; high ${high}; ${input.resolution}-bit maximum ${maximum}`);
			}, 50);
		}, 50);
	}

	portCEnter() {
		this.serialRunning = false;
		this.buttons = [["Run", "portCRun"], ["FAIL", "fail"]];
		this.set(WAIT, "Wire Port C G6 (TX) to G7 (RX), then tap Run.", "UART settings: 115200 baud, 8N1.");
	}

	portCRun() {
		this.startSerialLoopback(device.Serial.default, "Port C UART");
	}

	startSerialLoopback(provider, name) {
		if (this.serialRunning)
			return;
		this.serialRunning = true;
		const expected = Uint8Array.of(0x54, 0x41, 0x42, 0x35, 0xA5, 0x5A, 0x0D, 0x0A);
		const received = [];
		const model = this;
		const serial = this.own(new provider.io({
			...provider,
			baud:115200,
			onReadable() {
				const data = this.read();
				if (!data)
					return;
				for (const value of new Uint8Array(data))
					received.push(value);
				if (received.length >= expected.length) {
					const match = expected.every((value, index) => value === received[index]);
					model.set(match ? PASS : FAIL, `${name} sent: ${hex(expected)}`, `received: ${received.map(value => value.toString(16).padStart(2, "0")).join(" ")}`);
				}
			}
		}));
		this.set(RUNNING, `${name}: waiting for echo at 115200 8N1…`);
		serial.write(expected);
	}

	spiEnter() {
		this.spiRunning = false;
		this.buttons = [["Run", "spiRun"], ["FAIL", "fail"]];
		this.set(WAIT, "Wire M-Bus G18 (MOSI) to G19 (MISO), then tap Run.", "SPI clock is G5; the loopback uses 1 MHz, mode 0, no chip select.");
	}

	spiRun() {
		if (this.spiRunning)
			return;
		this.spiRunning = true;
		const spi = this.own(new device.SPI.default.io({...device.SPI.default, hz:1_000_000, mode:0}));
		const expected = Uint8Array.of(0x00, 0x55, 0xAA, 0xFF, 0x13, 0x37);
		const actual = expected.slice();
		spi.transfer(actual);
		this.set(expected.every((value, index) => value === actual[index]) ? PASS : FAIL,
			`Sent: ${hex(expected)}`, `Received: ${hex(actual)}`);
	}

	rs485Enter() {
		this.serialRunning = false;
		this.buttons = [["Run", "rs485Run"], ["FAIL", "fail"]];
		this.set(WAIT, "Connect A/B/GND to an external RS-485 echo peer, then tap Run.", "Peer settings: 115200 baud, 8N1.");
	}

	rs485Run() {
		this.startSerialLoopback(device.Serial.rs485, "RS-485");
	}

	powerEnter() {
		if (!this.power)
			throw new Error("power provider unavailable");
		this.powerSaved = this.power.configuration;
		this.powerRunning = false;
		this.powerExtra = undefined;
		this.buttons = [["Exercise outputs", "powerRun"], ["PASS", "pass"], ["FAIL", "fail"]];
		this.onLeave = () => this.power?.configure(this.powerSaved);
		this.every(() => this.updatePowerLines(), 500);
		this.set(WAIT);
		this.updatePowerLines();
	}

	updatePowerLines(extra) {
		this.update(
			`Charging: ${this.power.charging}; headphones: ${this.power.headphones}`,
			`Outputs: ${JSON.stringify(this.power.configuration)}`,
			extra ?? this.powerExtra ?? "Exercise external 5 V, USB 5 V, charge, quick charge, and external antenna; then confirm."
		);
	}

	powerRun() {
		if (this.powerRunning)
			return;
		this.powerRunning = true;
		const names = ["external", "usb", "charge", "quickCharge", "externalAntenna"];
		let index = 0;
		const next = () => {
			if (index >= names.length) {
				this.power.configure(this.powerSaved);
				this.powerRunning = false;
				this.powerExtra = "Output sequence finished and original states restored. Confirm externally, then press PASS.";
				this.set(WAIT);
				this.updatePowerLines();
				return;
			}
			const name = names[index++];
			this.power.configure({[name]:!this.powerSaved[name]});
			this.powerExtra = `Toggled ${name}; restoring shortly…`;
			this.updatePowerLines();
			this.after(() => {
				this.power.configure({[name]:this.powerSaved[name]});
				this.after(next, 200);
			}, 500);
		};
		this.set(RUNNING, "Exercising power outputs…");
		next();
	}

	wakeEnter() {
		this.wakeArmed = false;
		this.buttons = [["Arm 30 s", "wakeArm"], ["POWER OFF", "wakePowerOff"], ["FAIL", "fail"]];
		this.set(WAIT,
			"Run this destructive test last. Results are not persisted.",
			"Tap Arm 30 s, then POWER OFF. Observe whether the dashboard returns after about 30 seconds.",
			"USB power may keep the display powered even while the board power rail cycles."
		);
	}

	wakeArm() {
		this.wakeArmed = true;
		this.set(WAIT, "30-second RTC wake is ready but not programmed yet.", "Tap POWER OFF to program the timer and cut power.");
	}

	wakePowerOff() {
		if (!this.wakeArmed)
			return this.update("Not armed. Tap Arm 30 s first.");
		if (!this.power)
			return this.fail("power provider unavailable");
		this.update("Programming RX8130CE countdown and powering off…");
		this.after(() => {
			let rtc;
			try {
				rtc = new device.rtc.io(device.rtc);
				rtc.configure({alarm:0, timer:30_000});
				rtc.close();
				rtc = undefined;
				trace("RTC wake armed for 30 seconds; powering off\n");
				this.power.powerOff();
				this.set(WAIT, "Power-off requested. Waiting for RTC restart…");
			}
			catch (error) {
				try { rtc?.configure({timer:0}); }
				catch {}
				rtc?.close();
				this.fail(error);
			}
		}, 200);
	}

	capabilitiesEnter() {
		this.buttons = [["BACK", "back"]];
		this.set(PASS,
			"Bound and electrically tested elsewhere in this app:",
			"Digital G52; Analog G17; I2C G53/G54; UART G6/G7; SPI G5/G18/G19; RS-485 G20/G21/G34.",
			"Provider classes available without a named Tab5 endpoint:",
			"DigitalBank, PWM, PulseWidth, and PulseCount.",
			"Those generic classes are listed only; this app does not guess pins or external wiring."
		);
	}
}

class UIBehavior extends Behavior {
	onCreate(port, model) { this.model = model; }
	onDraw(port) { this.model.draw(port); }
	onTouchBegan(port, id, x, y) { this.model.touchBegan(id, x, y); }
	onTouchMoved(port, id, x, y) { this.model.touchMoved(id, x, y); }
	onTouchEnded(port, id, x, y) { this.model.touchEnded(id, x, y); }
	onTouchCancelled(port, id, x, y) { this.model.touchEnded(id, x, y); }
}

class ApplicationBehavior extends Behavior {
	onCreate(application, model) { this.model = model; model.bind(application); }
	onQuit() { this.model.shutdown(); }
}

const DiagnosticsApplication = Application.template($ => ({
	contents: [
		ImageBuffer($, {
			anchor:"PREVIEW", left:0, top:0,
			imageWidth:screen.height, imageHeight:screen.width,
			visible:false
		}),
		Port($, {
			anchor:"UI", left:0, right:0, top:0, bottom:0,
			active:true, backgroundTouch:true, Behavior:UIBehavior
		})
	],
	Behavior:ApplicationBehavior
}));

const model = new Diagnostics();
export default new DiagnosticsApplication(model, {
	pixels:screen.width * 16,
	commandListLength:4096,
	displayListLength:4096,
	touchCount:5
});
