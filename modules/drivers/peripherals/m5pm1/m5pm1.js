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


export default class M5PM1 {
	#io;
	constructor(options) {
		this.#io = new options.io({hz: 100_000, address: 0x6E, ...options});
		try {
			this.#io.writeUint8(0x09, 0);
			this.#io.writeUint8(0x0A, 0);
			this.#io.writeUint8(0x06, this.#io.readUint8(0x06) | 0x17);
		}
		catch (e) { this.close(); throw e; }
	}
	configureWake({pin, edge = "falling", enabled = true}) {
		this.#validateWakePin(pin);
		if (edge !== "falling" && edge !== "rising") throw new RangeError("invalid edge");
		const io = this.#io;
		if (!io) throw new Error("closed");
		const mask = 1 << pin;
		this.#update(0x18, mask, 0);
		if (!enabled) return;
		this.#update(0x10, mask, 0);
		const shift = (pin & 3) * 2;
		this.#update(pin === 4 ? 0x15 : 0x14, 3 << shift, 0);
		this.#update(pin === 4 ? 0x17 : 0x16, 3 << shift, 2 << shift);
		this.#update(0x19, mask, edge === "rising" ? mask : 0);
		this.#update(0x18, mask, mask);
	}
	get status() {
		if (!this.#io) throw new Error("closed");
		return {
			powerSource: this.#io.readUint8(0x04) & 7,
			wakeSource: this.#io.readUint8(0x05) & 0x7F,
			inputs: this.#io.readUint8(0x12) & 0x1F
		};
	}
	verifyWake({pin, edge = "falling"}) {
		this.#validateWakePin(pin);
		if (edge !== "falling" && edge !== "rising") throw new RangeError("invalid edge");
		const io = this.#io;
		if (!io) throw new Error("closed");
		const mask = 1 << pin, shift = (pin & 3) * 2;
		return !(io.readUint8(0x10) & mask) &&
			((io.readUint8(pin === 4 ? 0x17 : 0x16) >> shift) & 3) === 2 &&
			Boolean(io.readUint8(0x18) & mask) &&
			Boolean(io.readUint8(0x19) & mask) === (edge === "rising") &&
			Boolean(io.readUint8(0x12) & mask) === (edge === "falling");
	}
	shutdown({wakePin, edge = "falling"}) {
		if (!this.verifyWake({pin: wakePin, edge})) throw new Error("wake not ready");
		// External supply shutdown/restart behavior is not yet verified on hardware.
		if ((this.#io.readUint8(0x04) & 7) !== 4) throw new Error("battery power required");
		this.#io.writeUint8(0x0C, 0xA1);
	}
	#validateWakePin(pin) {
		if (![0, 2, 3, 4].includes(pin)) throw new RangeError("wake pin must be 0, 2, 3, or 4");
	}
	#update(reg, mask, value) {
		const io = this.#io;
		const next = (io.readUint8(reg) & ~mask) | (value & mask);
		io.writeUint8(reg, next);
		if ((io.readUint8(reg) & mask) !== (next & mask)) throw new Error("wake configuration readback failed");
	}
	close() { this.#io?.close(); this.#io = undefined; }
}
