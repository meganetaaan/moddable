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

const FW_VERSION = Object.freeze(Uint8Array.of(0x00, 0x00).buffer);
const MAX_TOUCHES = Object.freeze(Uint8Array.of(0x00, 0x09).buffer);
const STATUS = Object.freeze(Uint8Array.of(0x00, 0x10).buffer);
const COORDINATES = Object.freeze(Uint8Array.of(0x00, 0x14).buffer);

class ST712x {
	#io;
	#data;
	#length;
	#maxLength;

	constructor(options) {
		const {sensor, interrupt, onSample, target} = options;
		const io = this.#io = new sensor.io({
			hz: 400_000,
			address: 0x55,
			...sensor
		});

		try {
			const one = new Uint8Array(1);
			io.writeRead(FW_VERSION, one);
			if ((1 !== one[0]) && (3 !== one[0]))
				throw new Error("unrecognized");

			io.writeRead(MAX_TOUCHES, one);
			if ((one[0] < 1) || (one[0] > 10))
				throw new Error("unrecognized");
			this.#maxLength = one[0];

			if (interrupt && onSample) {
				io.interrupt = new interrupt.io({
					...interrupt,
					edge: interrupt.io.Falling,
					onReadable: onSample.bind(this)
				});
			}
			if (target)
				this.target = target;

			this.configure({length: Math.min(this.#maxLength, 5)});
		}
		catch (e) {
			this.close();
			throw e;
		}
	}
	close() {
		this.#io?.interrupt?.close();
		this.#io?.close();
		this.#io = undefined;
	}
	configure(options) {
		let {length} = options;
		if (undefined === length)
			return;

		length = parseInt(length);
		if ((length < 1) || (length > this.#maxLength))
			throw new RangeError("invalid length");
		this.#length = length;
		this.#data = new Uint8Array(length * 7);
	}
	get configuration() {
		return {
			interrupt: !!this.#io.interrupt,
			length: this.#length
		};
	}
	sample() {
		const io = this.#io;
		const status = new Uint8Array(1);
		io.writeRead(STATUS, status);
		if (!(status[0] & 0x08))
			return [];

		const data = this.#data;
		io.writeRead(COORDINATES, data);
		const result = [];
		for (let id = 0; id < this.#length; id++) {
			const offset = id * 7;
			if (!(data[offset] & 0x80))
				continue;

			result.push({
				id,
				x: ((data[offset] & 0x3F) << 8) | data[offset + 1],
				y: (data[offset + 2] << 8) | data[offset + 3],
				size: data[offset + 4],
				intensity: data[offset + 5]
			});
		}
		return result;
	}

	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

export default ST712x;
