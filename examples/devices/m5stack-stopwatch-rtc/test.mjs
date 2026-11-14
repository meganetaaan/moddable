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




import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source = (await readFile(new URL("./main.js", import.meta.url), "utf8")).replace(/^import .*;$/gm, "");
let sequence = 0;
async function scenario({valid = true, sourcePower = 4, active = false, fire = false, confirm = false, remoteArm = false, bootAlarm = false} = {}) {
	const buttons = [], timers = [], logs = [], colors = [];
	let writes = 0, shutdowns = 0, closed = 0;
	const rtc = {
		time: valid ? Date.UTC(2026, 10, 14, 12) : undefined,
		status: {alarmPending: bootAlarm, alarmEnabled: bootAlarm},
		configuration: {alarm: 0},
		configure({alarm}) { writes++; this.configuration.alarm = alarm; this.status.alarmEnabled = !!alarm; this.status.alarmPending = false; },
		verifyAlarm() { return !!this.configuration.alarm; },
		close() { closed++; }
	};
	globalThis.device = {
		rtc: {io: class {constructor() { return rtc; }}, clock: {}},
		io: {SMBus: class {}},
		peripheral: {button: {A: class {constructor(o) { this.push = o.onPush; buttons.push(this); } close() {}},
			B: class {constructor(o) { this.push = o.onPush; buttons.push(this); } close() {}}}}
	};
	globalThis.power = {
		status: {powerSource: sourcePower, inputs: active ? 0 : 1, wakeSource: 0},
		configureWake() {},
		verifyWake() { return !active; },
		shutdown() { shutdowns++; },
		close() { closed++; }
	};
	globalThis.screen = {};
	globalThis.trace = text => logs.push(text);
	globalThis.__rtcTest = {
		Poco: class { width=466; height=466; begin() {} end() {} fillRectangle() {} makeColor(...rgb) { colors.push(rgb); return 0; } close() {} },
		Timer: {repeat(fn) {timers.push(fn); return fn;}, clear() {}}
	};
	const prelude = "const {Poco, Timer} = globalThis.__rtcTest;";
	await import("data:text/javascript;base64," + Buffer.from(prelude + source + "//" + sequence++).toString("base64"));
	assert.equal(shutdowns, 0);
	assert.deepEqual(colors[0], bootAlarm ? [80, 0, 100] : [0, 30, 70]);
	assert.equal(rtc.status.alarmPending, false);
	assert.ok(logs.some(x => x.includes('"alarmPending":' + bootAlarm)));
	const initialWrites = writes;
	const initialTime = rtc.time;
	assert.throws(() => rtcTest.confirmHostTime(Date.now() - 60000));
	if (!(sourcePower & 1)) { assert.throws(() => rtcTest.confirmHostTime(Date.now()), /USB/); assert.throws(() => rtcTest.syncAndArm(Date.now()), /USB/); }
	if (remoteArm) {
		assert.throws(() => rtcTest.syncAndArm(Date.now() - 60000));
		const armed = rtcTest.syncAndArm(Date.now());
		assert.equal(armed, rtc.configuration.alarm);
		assert.ok(armed > rtc.time);
		assert.equal(shutdowns, 0);
		assert.throws(() => rtcTest.syncAndArm(Date.now()), /already armed/);
	}
	else {
		if (confirm) rtcTest.confirmHostTime(Date.now());
		buttons[0].pressed = true; buttons[0].push.call(buttons[0]);
	}
	if (!valid && !confirm) assert.equal(writes, initialWrites);
	if (confirm && !valid) assert.ok(Math.abs(rtc.time - Date.now()) < 2000);
	if (valid) assert.equal(rtc.time, initialTime);
	if (fire) {
		rtc.status.alarmPending = true;
		power.status.inputs = 0;
		timers[0]();
		assert.equal(rtc.status.alarmPending, false);
		assert.ok(logs.some(x => x.includes("PM1_GPIO0_LOW=true")));
	}
	buttons[1].pressed = true; buttons[1].push.call(buttons[1]);
	buttons[1].push.call(buttons[1]);
	const expected = valid && sourcePower === 4 && !active && !fire;
	assert.equal(shutdowns, expected ? 1 : 0);
	if (expected) assert.equal(closed, 2);
}
await scenario();
await scenario({bootAlarm: true});
await scenario({valid: false});
for (const sourcePower of [0, 1, 2, 3, 5, 6, 7]) await scenario({sourcePower});
await scenario({active: true});
await scenario({fire: true});
await scenario({valid: false, sourcePower: 5, confirm: true});
await scenario({sourcePower: 5, confirm: true});
await scenario({valid: false, sourcePower: 1, confirm: true});
await scenario({valid: false, sourcePower: 7, confirm: true});
await scenario({valid: false, sourcePower: 5, confirm: true, remoteArm: true, fire: true});
await scenario({sourcePower: 5, remoteArm: true});
console.log("RTC sample safety mocks passed");
