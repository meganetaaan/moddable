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
import Display from "embedded:display/m5stack-tab5";
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

const device = {
	display: {
		default: {
			io: Tab5Display,
			brightness: 1
		}
	},
	I2C: {
		internal: {
			io: I2C,
			data: 31,
			clock: 32,
			port: 1
		}
	},
	io: {Analog, Digital, DigitalBank, I2C, PulseCount, PulseWidth, PWM, Serial, SMBus, SPI},
	sensor: {
		Touch: Tab5Touch
	},
	pin: {}
};

export default device;
