/*
 * Copyright (c) 2016-2017  Moddable Tech, Inc.
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



import Poco from "commodetto/Poco";
import Timer from "timer";

const rtc = new device.rtc.io({...device.rtc, clock: {...device.rtc.clock, io: device.io.SMBus}});
let render = new Poco(screen);
let deadline;
let committed = false;
let quiescing = false;
let poll;
let buttons = [];
const minimumLead = 30_000;
let hostEvidence;
// The debugger's startup time alone is not fresh evidence. The operator sends
// a newly sampled host UTC value, then presses A within one minute.
globalThis.rtcTest = Object.freeze({
	confirmHostTime(hostUTC) {
		if (committed || quiescing || deadline !== undefined) throw new Error("test already armed or closing");
		if (!(power.status.powerSource & 1)) throw new Error("USB/DC input required for host time confirmation");
		const local = Date.now();
		if (!Number.isSafeInteger(hostUTC) || hostUTC < Date.UTC(2025, 0, 1) || hostUTC >= Date.UTC(2100, 0, 1) ||
			Math.abs(local - hostUTC) > 5000) throw new Error("fresh host UTC must match debugger-synchronized system time within 5 seconds");
		hostEvidence = local;
		report("HOST UTC confirmed host=" + hostUTC + " system=" + local + " deltaMs=" + (local - hostUTC) + "; press A within 60 seconds");
		return local - hostUTC;
	},
	syncAndArm(hostUTC) {
		globalThis.rtcTest.confirmHostTime(hostUTC);
		arm(true);
		return deadline;
	}
});
function initializeInvalidClock() {
	if (rtc.time !== undefined) return;
	const now = Date.now();
	if (hostEvidence === undefined || now < hostEvidence || now - hostEvidence > 60000 || !(power.status.powerSource & 1))
		throw new Error("invalid RTC: fresh rtcTest.confirmHostTime(host UTC milliseconds) and USB required; no RTC time written");
	hostEvidence = undefined;
	rtc.time = now;
	const readback = rtc.time;
	if (readback === undefined || Math.abs(readback - now) > 2000) throw new Error("RTC time readback failed; no alarm armed");
	report("TIME SYNC system=" + now + " rtc=" + readback + "; debugger has whole-second host resolution plus transport delay");
}

function paint(r, g, b) {
	render.begin();
	render.fillRectangle(render.makeColor(r, g, b), 0, 0, render.width, render.height);
	render.end();
}
function report(message) { trace("RTC TEST: " + message + "\n"); }
function ready() {
	const now = rtc.time;
	if (now === undefined) throw new Error("RTC time invalid; set actual UTC time before testing");
	if (deadline === undefined || deadline - now < minimumLead) throw new Error("arm a fresh alarm with A first");
	if (rtc.configuration.alarm !== deadline || !rtc.verifyAlarm()) throw new Error("RTC alarm readback failed");
	if (power.status.powerSource !== 4) throw new Error("battery-only operation required; disconnect USB/external supply");
	if (!(power.status.inputs & 1)) throw new Error("shared RTC/IMU interrupt is active");
}
function arm(strict = false) {
	if (committed || quiescing) return;
	try {
		initializeInvalidClock();
		const now = rtc.time;
		if (now === undefined) throw new Error("RTC time invalid; no clock/alarm value written");
		rtc.configure({alarm: now + 120_000});
		if (!rtc.verifyAlarm()) throw new Error("RTC alarm readback failed");
		deadline = rtc.configuration.alarm;
		paint(0, 100, 0);
		report("ARMED " + new Date(deadline).toISOString() + "; B requests battery-only shutdown, or leave awake to test IRQ polling");
	}
	catch (e) { report("A rejected: " + e); if (strict) throw e; }
}
function requestShutdown() {
	if (committed || quiescing) return;
	try {
		ready();
		power.configureWake({pin: 0, edge: "falling"});
		if (!power.verifyWake({pin: 0})) throw new Error("PM1 wake readback/line check failed");
		ready();
	}
	catch (e) { report("B rejected, no shutdown request: " + e); return; }

	quiescing = true;
	try {
		paint(100, 50, 0);
		Timer.clear(poll); poll = undefined;
		for (const button of buttons) button.close();
		buttons = [];
		render.close(); render = undefined;
		// Do not release RTC/PM1 until the last readback and shutdown transaction.
		ready();
		if (!power.verifyWake({pin: 0})) throw new Error("wake changed during cleanup");
		committed = true;
		report("requesting shutdown once; return/ACK is NOT confirmation of power-off or wake");
		power.shutdown({wakePin: 0});
		report("shutdown command returned; verify power transition externally, no retry");
	}
	catch (e) {
		report((committed ? "shutdown outcome uncertain: " : "cleanup/precondition failed, no shutdown: ") + e);
	}
	finally {
		// Retain the hardware alarm after an uncertain transition.
		for (const button of buttons) { try { button.close(); } catch (e) { report("button close: " + e); } }
		buttons = [];
		try { render?.close(); } catch (e) { report("render close: " + e); }
		render = undefined;
		try { rtc.close(); } catch (e) { report("RTC close: " + e); }
		try { power.close(); } catch (e) { report("PM1 close: " + e); }
		report("test handles closed; reset manually for another test");
	}
}

const bootPower = power.status;
const bootRTC = rtc.status;
const bootAlarmPending = bootRTC.alarmPending;
report("BOOT wake=" + JSON.stringify(bootPower) + " rtc=" + rtc.time + " alarm=" + JSON.stringify(bootRTC));
if (bootAlarmPending) report("previous alarm flag present at boot; PURPLE marks retained alarm evidence, not proof of wake cause");
rtc.configure({alarm: 0});
if (bootAlarmPending) paint(80, 0, 100);
else paint(0, 30, 70);
report("BLUE=idle GREEN=armed AMBER=shutdown attempt. A arms +2 minutes; B validates and requests shutdown. No automatic sleep.");
if (rtc.time === undefined) report("RTC invalid: connect serial2xsbug, confirm fresh host UTC with rtcTest.confirmHostTime(milliseconds), then press A. No build timestamp is substituted.");

buttons = [
	new device.peripheral.button.A({onPush() { if (this.pressed) arm(); }}),
	new device.peripheral.button.B({onPush() { if (this.pressed) requestShutdown(); }})
];
poll = Timer.repeat(() => {
	if (quiescing || committed) return;
	try {
		if (!rtc.status.alarmPending) return;
		const sharedLow = !(power.status.inputs & 1);
		report("AWAKE ALARM flag=1 PM1_GPIO0_LOW=" + sharedLow + " time=" + rtc.time);
		rtc.configure({alarm: 0});
		deadline = undefined;
		paint(80, 0, 100);
		report("PURPLE=alarm observed and acknowledged; no shutdown performed");
	}
	catch (e) {
		Timer.clear(poll); poll = undefined;
		report("poll stopped after I2C error: " + e);
	}
}, 250);
