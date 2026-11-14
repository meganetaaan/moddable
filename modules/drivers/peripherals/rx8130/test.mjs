/*
 * Copyright (c) 2021-2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 *
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */



import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source = await readFile(new URL("./rx8130.js", import.meta.url), "utf8");
const {default: RX8130} = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

class SMBus {
	static current;
	registers = new Uint8Array(256);
	writes = [];
	constructor(options) { this.options = options; SMBus.current = this; }
	readUint8(r) { return this.registers[r]; }
	writeUint8(r, v) {
		this.writes.push([r, v]);
		if (r === 0x1D)
			this.registers[r] &= v;
		else
			this.registers[r] = v;
	}
	readBuffer(r, b) { b.set(this.registers.subarray(r, r + b.length)); }
	writeBuffer(r, b) {
		if (this.failWrite) throw new Error("bus fault");
		this.registers.set(b, r);
	}
	close() { this.closed = true; }
}

const rtc = new RX8130({clock: {io: SMBus}});
const bus = SMBus.current;
assert.equal(bus.options.address, 0x32);
assert.deepEqual(rtc.configuration, {charge: false, alarm: 0});
assert.equal(bus.registers[0x1F] & 0x10, 0x10);
rtc.configure({charge: true, alarm: 0});
assert.deepEqual(rtc.configuration, {charge: true, alarm: 0});
bus.registers[0x1D] = 0xBA;
bus.registers[0x1E] = 8;
const value = Date.UTC(2024, 1, 29, 23, 59, 58);
rtc.time = value;
assert.equal(rtc.time, value);
assert.deepEqual([...bus.registers.slice(0x10, 0x17)], [0x58, 0x59, 0x23, 16, 0x29, 2, 0x24]);
assert.equal(bus.registers[0x1D], 0xB0);
assert.equal(bus.registers[0x1E], 0);
for (const bad of [NaN, Infinity, -Infinity, "2024", Date.UTC(1999, 11, 31), Date.UTC(2100, 0, 1)]) {
	const count = bus.writes.length;
	assert.throws(() => { rtc.time = bad; }, RangeError);
	assert.equal(bus.writes.length, count);
}
for (const valid of [Date.UTC(2000, 0, 1), Date.UTC(2099, 11, 31, 23, 59, 59)]) {
	rtc.time = valid;
	assert.equal(rtc.time, valid);
}
for (const [register, bad] of [[0x10, 0x6A], [0x11, 0x60], [0x12, 0x24], [0x13, 3], [0x14, 0], [0x15, 0x13], [0x16, 0xAA]]) {
	rtc.time = value;
	bus.registers[register] = bad;
	assert.equal(rtc.time, undefined);
}
rtc.time = value;
bus.registers[0x16] = 0x23;
assert.equal(rtc.time, undefined); // February 29 in a non-leap year.
rtc.time = value;
bus.registers[0x1D] |= 2;
assert.equal(rtc.time, undefined);
rtc.time = value;
bus.registers[0x1E] |= 0x40;
assert.equal(rtc.time, undefined);
bus.failWrite = true;
assert.throws(() => { rtc.time = value; }, /bus fault/);
assert.equal(rtc.time, undefined);
assert.equal(bus.registers[0x1E] & 0x40, 0x40);
bus.failWrite = false;
rtc.time = value;
assert.equal(rtc.time, value);
assert.throws(() => rtc.configure({alarm: value}), RangeError);
rtc.close();
rtc.close();
assert.equal(bus.closed, true);
assert.throws(() => rtc.time, /closed/);
assert.throws(() => { rtc.time = value; }, /closed/);
assert.throws(() => rtc.configuration, /closed/);
assert.throws(() => rtc.configure({}), /closed/);
class BrokenBus extends SMBus {
	readUint8() { throw new Error("offline"); }
}
assert.throws(() => new RX8130({clock: {io: BrokenBus}}), /offline/);
assert.equal(SMBus.current.closed, true);

class Interrupt {
	static current;
	static InputPullUp = 1;
	static Falling = 2;
	constructor(options) { Interrupt.current = this; this.options = options; }
	fire() { this.options.onReadable(); }
	close() { this.closed = true; }
}
let calls = 0;
const alarmRTC = new RX8130({clock: {io: SMBus}, interrupt: {io: Interrupt, pin: 4}, onAlarm() { assert.equal(this, alarmRTC); calls++; }});
const ab = SMBus.current, irq = Interrupt.current;
const now = Date.UTC(2026, 0, 31, 23, 59, 20);
alarmRTC.time = now;
ab.registers[0x1C] = 0x10;
ab.registers[0x1D] = 0x18;
alarmRTC.configure({alarm: now + 1000});
assert.deepEqual([...ab.registers.slice(0x17, 0x1A)], [0, 0, 1]);
assert.equal(ab.registers[0x1C], 0x18);
assert.equal(ab.registers[0x1D], 0x10);
assert.equal(alarmRTC.configuration.alarm, Date.UTC(2026, 1, 1));
assert.equal(alarmRTC.verifyAlarm(), true);
ab.registers[0x17] = 1;
assert.equal(alarmRTC.verifyAlarm(), false);
ab.registers[0x17] = 0;
ab.registers[0x1D] |= 8;
assert.equal(alarmRTC.verifyAlarm(), false);
ab.registers[0x1D] &= ~8;
assert.equal(alarmRTC.verifyAlarm(), true);
irq.fire();
assert.equal(calls, 0);
ab.registers[0x1D] |= 8;
assert.equal(alarmRTC.status.alarmPending, true);
assert.equal(alarmRTC.status.alarmEnabled, true);
irq.fire(); irq.fire();
assert.equal(calls, 1);
assert.deepEqual(alarmRTC.status, {alarmPending: false, alarmEnabled: false});
assert.equal(ab.registers[0x1D], 0x10);
assert.equal(alarmRTC.configuration.alarm, 0);
for (const invalid of [null, NaN, Infinity, "tomorrow", now, now - 1, now + 28 * 86400000]) {
	const count = ab.writes.length;
	assert.throws(() => alarmRTC.configure({alarm: invalid}), RangeError);
	assert.equal(ab.writes.length, count);
}
ab.registers[0x1D] |= 2;
assert.throws(() => alarmRTC.configure({alarm: now + 60000}), RangeError);
alarmRTC.time = now;
ab.failWrite = true;
assert.throws(() => alarmRTC.configure({alarm: now + 60000}), /bus fault/);
assert.equal(ab.registers[0x1E] & 8, 0);
ab.failWrite = false;
alarmRTC.configure({alarm: now + 60000});
const shifted = Date.UTC(2025, 11, 31, 23, 59, 20);
alarmRTC.time = shifted;
assert.equal(alarmRTC.time, shifted);
assert.equal(alarmRTC.configuration.alarm, 0);
assert.equal(alarmRTC.verifyAlarm(), false);
assert.equal(ab.registers[0x1D] & 8, 0);
alarmRTC.configure({alarm: shifted + 60000});
const armed = alarmRTC.configuration.alarm;
assert.throws(() => { alarmRTC.time = NaN; }, RangeError);
assert.equal(alarmRTC.configuration.alarm, armed);
ab.failWrite = true;
assert.throws(() => { alarmRTC.time = now; }, /bus fault/);
assert.equal(alarmRTC.configuration.alarm, 0);
assert.equal(alarmRTC.verifyAlarm(), false);
ab.failWrite = false;
alarmRTC.time = now;
alarmRTC.configure({alarm: now + 60000});
alarmRTC.close(); alarmRTC.close();
assert.equal(irq.closed, true);
assert.equal(ab.registers[0x1E] & 8, 8); // Close must preserve hardware wake.
irq.fire();
assert.equal(calls, 1);
assert.throws(() => new RX8130({clock: {io: SMBus}, onAlarm() {}}), /interrupt required/);
console.log("RX8130 time and alarm mock tests passed");
