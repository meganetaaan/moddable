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

const IO_DIRECTION = 0x03;
const OUTPUT = 0x05;
const OUTPUT_HIGH_IMPEDANCE = 0x07;
const PULL_ENABLE = 0x0B;
const PULL_SELECT = 0x0D;
const INPUT = 0x0F;

function readRegister(state, register) {
	const buffer = state.readBuffer;
	buffer[0] = register;
	state.io.writeRead(buffer, buffer);
	return buffer[0];
}

function writeRegister(state, register, value) {
	const buffer = state.writeBuffer;
	buffer[0] = register;
	buffer[1] = value;
	state.io.write(buffer);
}

function updateRegister(state, register, pins, value) {
	const current = readRegister(state, register);
	const next = (current & ~pins) | (value & pins);
	if (current !== next)
		writeRegister(state, register, next);
}

class DigitalBank {
	#output;
	#pins;
	#state;

	constructor(options, state) {
		const {mode, onReadable, edge, target} = options;
		const pins = options.pins;
		if (!Number.isInteger(pins) || (pins <= 0) || (pins & ~0xFF))
			throw new RangeError("invalid pins");
		if ((undefined !== onReadable) || (undefined !== edge))
			throw new RangeError("interrupt unavailable");
		if ((undefined !== options.format) && ("number" !== options.format))
			throw new RangeError("invalid format");
		if ((DigitalBank.Input !== mode) &&
			(DigitalBank.InputPullUp !== mode) &&
			(DigitalBank.InputPullDown !== mode) &&
			(DigitalBank.Output !== mode))
			throw new RangeError("invalid mode");
		if (!state.io)
			throw new Error("closed");
		if (state.used & pins)
			throw new Error("in use");

		state.used |= pins;
		this.#state = state;
		this.#pins = pins;
		this.#output = DigitalBank.Output === mode;
		if (undefined !== target)
			this.target = target;

		try {
			if (this.#output) {
				updateRegister(state, PULL_ENABLE, pins, 0);
				updateRegister(state, OUTPUT_HIGH_IMPEDANCE, pins, 0);
				updateRegister(state, IO_DIRECTION, pins, pins);
			}
			else {
				updateRegister(state, IO_DIRECTION, pins, 0);
				if (DigitalBank.Input === mode)
					updateRegister(state, PULL_ENABLE, pins, 0);
				else {
					updateRegister(state, PULL_SELECT, pins,
						(DigitalBank.InputPullUp === mode) ? pins : 0);
					updateRegister(state, PULL_ENABLE, pins, pins);
				}
			}
		}
		catch (e) {
			state.used &= ~pins;
			this.#state = undefined;
			throw e;
		}
	}
	close() {
		const state = this.#state;
		if (!state)
			return;
		state.used &= ~this.#pins;
		this.#state = undefined;
	}
	read() {
		const state = this.#state;
		if (!state?.io)
			throw new Error("closed");
		return readRegister(state, INPUT) & this.#pins;
	}
	write(value) {
		const state = this.#state;
		if (!state?.io)
			throw new Error("closed");
		if (!this.#output)
			throw new Error("not output");
		updateRegister(state, OUTPUT, this.#pins, value);
	}
	get format() {
		return "number";
	}
	set format(value) {
		if ("number" !== value)
			throw new RangeError("invalid format");
	}

	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

DigitalBank.Input = 0;
DigitalBank.InputPullUp = 1;
DigitalBank.InputPullDown = 2;
DigitalBank.InputPullUpDown = 3;
DigitalBank.Output = 8;
DigitalBank.OutputOpenDrain = 9;
DigitalBank.Rising = 1;
DigitalBank.Falling = 2;

class Digital extends DigitalBank {
	constructor(options, state) {
		const pin = options.pin;
		if (!Number.isInteger(pin) || (pin < 0) || (pin > 7))
			throw new RangeError("invalid pin");
		options = {...options, pins: 1 << pin};
		delete options.pin;
		super(options, state);
	}
	read() {
		return super.read() ? 1 : 0;
	}
	write(value) {
		super.write(value ? ~0 : 0);
	}
}

Digital.Input = DigitalBank.Input;
Digital.InputPullUp = DigitalBank.InputPullUp;
Digital.InputPullDown = DigitalBank.InputPullDown;
Digital.InputPullUpDown = DigitalBank.InputPullUpDown;
Digital.Output = DigitalBank.Output;
Digital.OutputOpenDrain = DigitalBank.OutputOpenDrain;
Digital.Rising = DigitalBank.Rising;
Digital.Falling = DigitalBank.Falling;

class PI4IOE5V6408 {
	#state;

	constructor(options) {
		const i2c = options?.i2c;
		if ("function" !== typeof i2c?.io)
			throw new TypeError("invalid i2c");
		const {io: IO, ...bus} = i2c;
		const state = this.#state = {
			io: new IO({
				...bus,
				address: options.address ?? bus.address ?? 0x43,
				hz: bus.hz ?? 400_000
			}),
			readBuffer: new Uint8Array(1),
			writeBuffer: new Uint8Array(2),
			used: 0
		};

		try {
			if (!readRegister(state, 0x01))
				throw new Error("unrecognized");
		}
		catch (e) {
			this.close();
			throw e;
		}

		this.Digital = class extends Digital {
			constructor(options) {
				super(options, state);
			}
		};
		this.DigitalBank = class extends DigitalBank {
			constructor(options) {
				super(options, state);
			}
		};
	}
	close() {
		const state = this.#state;
		if (!state)
			return;
		state.io?.close();
		state.io = undefined;
		this.#state = undefined;
		delete this.Digital;
		delete this.DigitalBank;
	}

	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

export default PI4IOE5V6408;
