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


export default class M5IOE1 {
	#io;
	constructor(options) {
		this.#io = new options.io({hz: 100_000, address: 0x4F, ...options});
		try { this.#io.writeUint8(0x23, 0); }
		catch (e) { this.close(); throw e; }
	}
	close() { this.#io?.close(); this.#io = undefined; }
	#pin(pin) {
		if (!Number.isInteger(pin) || pin < 1 || pin > 14) throw new RangeError("pin must be 1..14");
		return pin - 1;
	}
	#update(reg, mask, value) {
		this.#io.writeUint8(reg, (this.#io.readUint8(reg) & ~mask) | (value & mask));
	}
	configure({pin, output = true}) {
		const n = this.#pin(pin), bank = n >> 3, mask = 1 << (n & 7);
		const pwmRegister = ({9: 0x1C, 8: 0x1E, 11: 0x20, 10: 0x22})[pin];
		if (pwmRegister !== undefined) this.#update(pwmRegister, 0x80, 0);
		this.#update(0x13 + bank, mask, 0);
		this.#update(0x03 + bank, mask, output ? mask : 0);
	}
	write(pin, value) {
		const n = this.#pin(pin), mask = 1 << (n & 7);
		this.#update(0x05 + (n >> 3), mask, value ? mask : 0);
	}
	read(pin) {
		const n = this.#pin(pin);
		return (this.#io.readUint8(0x07 + (n >> 3)) >> (n & 7)) & 1;
	}
}
