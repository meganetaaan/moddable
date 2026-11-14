/*
 * Copyright (c) 2026  Moddable Tech, Inc.
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


import Timer from "timer";
import CST820 from "embedded:sensor/Touch/CST820";
import CST9217 from "embedded:sensor/Touch/CST9217";
import BMI270 from "embedded:sensor/Accelerometer-Gyroscope-Magnetometer/BMI270";
import Button from "button";
import RTC from "embedded:RTC/RX8130";
import createAudioDevices from "stopwatchAudio";

class Backlight {
	#value = 1;
	set brightness(value) {
		this.#value = Math.max(0, Math.min(1, value));
		if (globalThis.screen) screen.brightness = this.#value * 100;
	}
	get brightness() { return this.#value; }
	write(value) { this.brightness = value / 100; }
	close() {}
}
class ButtonA {
	constructor(options) { return new Button({...options, io: device.io.Digital, pin: 2, mode: device.io.Digital.Input, activeLow: true}); }
}
class ButtonB {
	constructor(options) { return new Button({...options, io: device.io.Digital, pin: 1, mode: device.io.Digital.Input, activeLow: true}); }
}
class Touch {
	#touch; #scale;
	constructor(options = {}) {
		let found = false;
		const probe = new device.io.I2C({...device.i2c.default, address: 0x5A, hz: 100_000});
		try { probe.write(Uint8Array.of(0xD0, 0)); probe.read(1); found = true; } catch {}
		finally { probe.close(); }
		this.#scale = options.coordinateScale ?? 1;
		if (this.#scale !== 1 && this.#scale !== 2) throw new RangeError("coordinateScale must be 1 or 2");
		const onSample = options.onSample;
		this.#touch = new (found ? CST9217 : CST820)({...options,
			onSample: onSample ? () => onSample.call(this) : undefined,
			sensor: {...device.i2c.default, io: found ? device.io.I2C : device.io.SMBus},
			interrupt: {io: device.io.Digital, pin: 13, mode: device.io.Digital.Input}
		});
		if (found) this.#touch.configure({length: 2, width: 466, height: 466});
	}
	configure(options) { this.#touch.configure(options); }
	sample() {
		const points = this.#touch.sample();
		if (points && this.#scale === 2) for (const p of points) { p.x = Math.min(465, p.x * 2); p.y = Math.min(465, p.y * 2); }
		return points;
	}
	close() { this.#touch?.close(); this.#touch = undefined; }
}
class Vibration {
	write(value) { ioExpander.write(9, value); }
	close() { this.write(0); }
}
const device = {
	audio: createAudioDevices(() => device),
	i2c: {default: {io: "I2C", data: 47, clock: 48}, external: {io: "I2C", data: 10, clock: 11}},
	pin: {button: 2, buttonA: 2, buttonB: 1, touchInterrupt: 13, displayTE: 38},
	peripheral: {button: {Default: ButtonA, A: ButtonA, B: ButtonB}, Backlight, Vibration},
	sensor: {Touch, IMU: class extends BMI270 {
		constructor(options) { super({...options, sensor: {...device.i2c.default, io: device.io.SMBus, address: 0x68, enable: 6}}); }
	}}
};
device.rtc = {io: RTC, clock: {...device.i2c.default, io: "SMBus"}, charge: true};
export default device;
