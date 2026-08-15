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

import Analog from "embedded:io/analog";
import Digital from "embedded:io/digital";
import DigitalBank from "embedded:io/digitalbank";
import I2C from "embedded:io/i2c";
import PulseCount from "embedded:io/pulsecount";
import PulseWidth from "embedded:io/pulsewidth";
import PWM from "embedded:io/pwm";
import Serial from "embedded:io/serial";
import SMBus from "embedded:io/smbus";
import SPI from "embedded:io/spi";
import Timer from "timer";
import Display from "embedded:display/m5stack-tab5";
import PI4IOE5V6408 from "embedded:io/provider/PI4IOE5V6408";
import GT911 from "embedded:sensor/Touch/GT911";
import ST712x from "embedded:sensor/Touch/ST712x";
import prepare from "m5stack-tab5/board";

class Tab5Display extends Display {
	#backlight;
	#brightness = 1;

	constructor(options) {
		super(options);
		try {
			this.#backlight = new PWM({pin: 22, hz: 5_000, resolution: 10});
			this.configure({brightness: options.brightness ?? 1});
		}
		catch (e) {
			this.close();
			throw e;
		}
	}
	close() {
		this.#backlight?.close();
		this.#backlight = undefined;
		super.close();
	}
	configure(options) {
		const {brightness} = options;
		if ((undefined !== brightness) && ((brightness < 0) || (brightness > 1)))
			throw new RangeError("invalid brightness");

		super.configure(options);
		if (undefined !== brightness) {
			this.#backlight.write(Math.round(brightness * 1023));
			this.#brightness = brightness;
		}
	}
	get configuration() {
		return {...super.configuration, brightness: this.#brightness};
	}
}

class Tab5Touch {
	#touch;

	constructor(options = {}) {
		const panel = prepare();
		const sensor = device.I2C.internal;
		this.#touch = panel
			? new ST712x({...options, sensor})
			: new GT911({...options, sensor: {...sensor, address: 0x14}});
		this.#touch.configure({length: options.length ?? 5});
	}
	close() {
		this.#touch?.close();
		this.#touch = undefined;
	}
	configure(options) {
		return this.#touch.configure(options);
	}
	get configuration() {
		return this.#touch.configuration;
	}
	sample() {
		return this.#touch.sample();
	}

	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

const POWER_OPTIONS = Object.freeze(["wifi", "speaker", "external", "usb", "charge", "quickCharge", "externalAntenna"]);

class Tab5Power {
	#expanders = [];
	#pins = {};
	#state = {};

	constructor(options) {
		try {
			const i2c = options.i2c;
			const first = new PI4IOE5V6408({address: 0x43, i2c});
			this.#expanders.push(first);
			const second = new PI4IOE5V6408({address: 0x44, i2c});
			this.#expanders.push(second);
			this.#pins = {
				externalAntenna: new first.Digital({pin: 0, mode: first.Digital.Output}),
				speaker: new first.Digital({pin: 1, mode: first.Digital.Output}),
				headphones: new first.Digital({pin: 7, mode: first.Digital.Input}),
				wifi: new second.Digital({pin: 0, mode: second.Digital.Output}),
				powerOff: new second.Digital({pin: 4, mode: second.Digital.Output}),
				quickCharge: new second.Digital({pin: 5, mode: second.Digital.Output}),
				charging: new second.Digital({pin: 6, mode: second.Digital.InputPullDown}),
				charge: new second.Digital({pin: 7, mode: second.Digital.Output})
			};
			this.configure(options);
		}
		catch (e) {
			this.close();
			throw e;
		}
	}
	close() {
		for (const pin of Object.values(this.#pins))
			pin?.close();
		this.#pins = {};
		for (const expander of this.#expanders)
			expander.close();
		this.#expanders.length = 0;
	}
	configure(options) {
		for (const name of POWER_OPTIONS) {
			if ((undefined !== options[name]) && ("boolean" !== typeof options[name]))
				throw new TypeError(`invalid ${name}`);
		}

		this.#setOutput("wifi", options.wifi);
		this.#setOutput("speaker", options.speaker);
		this.#setPull("external", 0, 2, options.external);
		this.#setPull("usb", 1, 3, options.usb);
		this.#setOutput("charge", options.charge);
		this.#setOutput("quickCharge", options.quickCharge, true);
		this.#setOutput("externalAntenna", options.externalAntenna);
	}
	get configuration() {
		return {...this.#state};
	}
	get charging() {
		return !!this.#pins.charging.read();
	}
	get headphones() {
		return !!this.#pins.headphones.read();
	}
	powerOff() {
		const pin = this.#pins.powerOff;
		for (let i = 0; i < 10; i++) {
			pin.write(i & 1);
			Timer.delay(50);
		}
	}
	#setOutput(name, value, inverted = false) {
		if ((undefined === value) || (this.#state[name] === value))
			return;
		this.#pins[name].write(inverted ? !value : value);
		this.#state[name] = value;
	}
	#setPull(name, expanderIndex, pin, value) {
		if ((undefined === value) || (this.#state[name] === value))
			return;
		this.#pins[name]?.close();
		const expander = this.#expanders[expanderIndex];
		this.#pins[name] = new expander.Digital({
			pin,
			mode: value ? expander.Digital.InputPullUp : expander.Digital.InputPullDown
		});
		this.#state[name] = value;
	}

	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

const internalI2C = {
	io: I2C,
	data: 31,
	clock: 32,
	port: 1
};

const device = {
	display: {
		default: {
			io: Tab5Display,
			brightness: 1
		}
	},
	I2C: {
		default: {
			io: I2C,
			data: 53,
			clock: 54,
			port: 0
		},
		internal: internalI2C
	},
	SPI: {
		default: {
			io: SPI,
			clock: 5,
			in: 19,
			out: 18,
			port: 1
		}
	},
	io: {Analog, Digital, DigitalBank, I2C, PulseCount, PulseWidth, PWM, Serial, SMBus, SPI},
	power: {
		io: Tab5Power,
		i2c: internalI2C,
		wifi: true,
		speaker: false,
		external: true,
		usb: true,
		charge: true,
		quickCharge: true,
		externalAntenna: false
	},
	sensor: {
		Touch: Tab5Touch
	},
	pin: {}
};

export default device;
