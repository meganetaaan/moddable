/*---
description: RX8130CE reads and writes time, alarm, timer, and backup-power settings
flags: [module]
---*/

import RX8130CE from "embedded:RTC/RX8130CE";

class MockSMBus {
	static registers = new Uint8Array(256);
	static options;

	constructor(options) {
		MockSMBus.options = options;
	}
	close() {
		this.closed = true;
	}
	readUint8(register) {
		return MockSMBus.registers[register];
	}
	writeUint8(register, value) {
		MockSMBus.registers[register] = value;
	}
	readBuffer(register, destination) {
		destination.set(MockSMBus.registers.subarray(register, register + destination.byteLength));
	}
	writeBuffer(register, source) {
		MockSMBus.registers.set(source, register);
	}
}

const target = {};
const rtc = new RX8130CE({
	target,
	clock: {io: MockSMBus},
	backup: {charge: true, powerSwitch: true}
});
assert.sameValue(rtc.target, target);
assert.sameValue(MockSMBus.options.address, 0x32);
assert.sameValue(MockSMBus.options.hz, 400_000);
assert.sameValue(MockSMBus.registers[0x1F] & 0x30, 0x30);

MockSMBus.registers.set([0x17, 0x42, 0x05, 0x40, 0x15, 0x08, 0x26], 0x10);
const initial = Date.UTC(2026, 7, 15, 5, 42, 17);
assert.sameValue(rtc.time, initial);
MockSMBus.registers[0x1D] = 0x02;
assert.sameValue(rtc.time, undefined);
MockSMBus.registers[0x1D] = 0;

const updated = Date.UTC(2031, 11, 31, 23, 59, 58);
MockSMBus.registers[0x1D] = 0x02;
MockSMBus.registers[0x1E] = 0x40;
rtc.time = updated;
assert.compareArray(MockSMBus.registers.slice(0x10, 0x17), [
	0x58, 0x59, 0x23, 1 << new Date(updated).getUTCDay(), 0x31, 0x12, 0x31
]);
assert.sameValue(MockSMBus.registers[0x1D] & 0x02, 0);
assert.sameValue(MockSMBus.registers[0x1E] & 0x40, 0);
assert.throws(RangeError, () => rtc.time = Date.UTC(1999, 0, 1));

rtc.time = initial;
const alarm = Date.UTC(2026, 7, 16, 6, 30);
rtc.configure({alarm});
assert.compareArray(MockSMBus.registers.slice(0x17, 0x1A), [0x30, 0x06, 0x16]);
assert.sameValue(MockSMBus.registers[0x1C] & 0x08, 0x08);
assert.sameValue(MockSMBus.registers[0x1E] & 0x08, 0x08);
assert.sameValue(rtc.configuration.alarm, alarm);

const control = MockSMBus.registers[0x1E];
assert.throws(RangeError, () => rtc.configure({alarm: NaN}));
assert.sameValue(MockSMBus.registers[0x1E], control);
assert.throws(RangeError, () => rtc.configure({alarm: initial + (32 * 24 * 60 * 60 * 1000)}));
rtc.configure({alarm: 0});
assert.sameValue(rtc.configuration.alarm, 0);

MockSMBus.registers[0x1C] = 0xC9;
MockSMBus.registers[0x1D] = 0xB0;
MockSMBus.registers[0x1E] = 0x89;
rtc.configure({timer: 30_000});
assert.compareArray(MockSMBus.registers.slice(0x1A, 0x1C), [30, 0]);
assert.sameValue(MockSMBus.registers[0x1C], 0xDA);
assert.sameValue(MockSMBus.registers[0x1D], 0xA0);
assert.sameValue(MockSMBus.registers[0x1E], 0x99);
assert.sameValue(rtc.configuration.timer, 30_000);

const timerRegisters = MockSMBus.registers.slice(0x17, 0x20);
for (const timer of [NaN, -1, 999, 1500, 65_536_000]) {
	assert.throws(RangeError, () => rtc.configure({alarm, timer}));
	assert.compareArray(MockSMBus.registers.slice(0x17, 0x20), timerRegisters);
}
assert.throws(RangeError, () => rtc.configure({alarm: NaN, timer: 1000}));
assert.compareArray(MockSMBus.registers.slice(0x17, 0x20), timerRegisters);

rtc.configure({timer: 65_535_000});
assert.compareArray(MockSMBus.registers.slice(0x1A, 0x1C), [0xFF, 0xFF]);
assert.sameValue(rtc.configuration.timer, 65_535_000);
rtc.configure({timer: 0});
assert.sameValue(MockSMBus.registers[0x1C] & 0x10, 0);
assert.sameValue(MockSMBus.registers[0x1D] & 0x10, 0);
assert.sameValue(MockSMBus.registers[0x1E] & 0x10, 0);
assert.sameValue(rtc.configuration.timer, 0);

rtc.close();
rtc.close();
assert.throws(TypeError, () => rtc.time);
