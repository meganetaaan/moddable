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

/*
	Texas Instruments INA226 current and power monitor
	https://www.ti.com/lit/ds/symlink/ina226.pdf
*/

const Register = Object.freeze({
	CONFIGURATION: 0x00,
	SHUNT_VOLTAGE: 0x01,
	BUS_VOLTAGE: 0x02,
	POWER: 0x03,
	CURRENT: 0x04,
	CALIBRATION: 0x05,
	DIE_ID: 0xFF
});

const CONFIGURATION = (2 << 9) | (4 << 6) | (4 << 3) | 7;

function signed16(value) {
	return (value & 0x8000) ? value - 0x10000 : value;
}

class INA226 {
	#io;
	#currentLSB;
	#maximumCurrent;
	#shuntResistance;

	constructor(options) {
		if ("target" in options)
			this.target = options.target;

		try {
			const {sensor} = options;
			const io = this.#io = new sensor.io({
				hz: 400_000,
				address: 0x40,
				...sensor
			});
			if (0x2260 !== io.readUint16(Register.DIE_ID, true))
				throw new Error("not INA226");
			this.configure({
				shuntResistance: options.shuntResistance ?? 0.005,
				maximumCurrent: options.maximumCurrent ?? 8.192
			});
		}
		catch (e) {
			this.close();
			throw e;
		}
	}
	close() {
		this.#io?.close();
		this.#io = undefined;
	}
	configure(options) {
		const shuntResistance = ("shuntResistance" in options) ? Number(options.shuntResistance) : this.#shuntResistance;
		const maximumCurrent = ("maximumCurrent" in options) ? Number(options.maximumCurrent) : this.#maximumCurrent;
		if (!Number.isFinite(shuntResistance) || (shuntResistance <= 0))
			throw new RangeError("invalid shuntResistance");
		if (!Number.isFinite(maximumCurrent) || (maximumCurrent <= 0))
			throw new RangeError("invalid maximumCurrent");

		const currentLSB = maximumCurrent / 32768;
		const calibration = Math.floor(0.00512 / (currentLSB * shuntResistance));
		if ((calibration < 1) || (calibration > 0xFFFF))
			throw new RangeError("calibration out of range");

		const io = this.#io;
		io.writeUint16(Register.CONFIGURATION, CONFIGURATION, true);
		io.writeUint16(Register.CALIBRATION, calibration, true);
		this.#currentLSB = currentLSB;
		this.#maximumCurrent = maximumCurrent;
		this.#shuntResistance = shuntResistance;
	}
	get configuration() {
		if (!this.#io)
			throw new Error("closed");
		return {
			shuntResistance: this.#shuntResistance,
			maximumCurrent: this.#maximumCurrent
		};
	}
	sample() {
		const io = this.#io;
		return {
			voltage: io.readUint16(Register.BUS_VOLTAGE, true) * 0.00125,
			current: signed16(io.readUint16(Register.CURRENT, true)) * this.#currentLSB,
			power: io.readUint16(Register.POWER, true) * this.#currentLSB * 25,
			shuntVoltage: signed16(io.readUint16(Register.SHUNT_VOLTAGE, true)) * 0.0000025
		};
	}

	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

export default INA226;
