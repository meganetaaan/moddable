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


const Register = Object.freeze({
	TIME: 0x10,
	ALARM: 0x17,
	EXTENSION: 0x1C,
	FLAGS: 0x1D,
	CONTROL0: 0x1E,
	CONTROL1: 0x1F
});

class RX8130 {
	#io;
	#interrupt;
	#onAlarm;
	#alarm;
	#buffer = new Uint8Array(7);

	constructor(options) {
		const {clock, charge = false, interrupt, onAlarm} = options;
		if (onAlarm && !interrupt)
			throw new Error("interrupt required for onAlarm");
		const io = this.#io = new clock.io({hz: 400_000, address: 0x32, ...clock});
		try {
			this.configure({charge});
			if (interrupt && onAlarm) {
				this.#onAlarm = onAlarm;
				this.#interrupt = new interrupt.io({
					...interrupt,
					mode: interrupt.mode ?? interrupt.io.InputPullUp,
					edge: interrupt.io.Falling,
					onReadable: () => {
						if (!this.#io || !(this.#io.readUint8(Register.CONTROL0) & 8) ||
						!(this.#io.readUint8(Register.FLAGS) & 8))
							return;
						this.configure({alarm: 0});
						this.#onAlarm.call(this);
					}
				});
			}
		}
		catch (e) {
			this.close();
			throw e;
		}
	}
	close() {
		try { this.#interrupt?.close(); }
		finally {
			this.#interrupt = undefined;
			this.#io?.close();
			this.#io = undefined;
		}
	}
	configure(options) {
		const io = this.#io;
		if (!io)
			throw new Error("closed");
		if (options.alarm !== undefined)
			this.#setAlarm(options.alarm);
		if (options.charge !== undefined) {
			// Charging must be explicitly enabled for a rechargeable backup supply.
			const control = io.readUint8(Register.CONTROL1);
			io.writeUint8(Register.CONTROL1, (control & ~0x20) | 0x10 | (options.charge ? 0x20 : 0));
		}
	}
	get configuration() {
		if (!this.#io)
			throw new Error("closed");
		return {
			charge: Boolean(this.#io.readUint8(Register.CONTROL1) & 0x20),
			alarm: (this.#io.readUint8(Register.CONTROL0) & 8) ? this.#alarm : 0
		};
	}
	get status() {
		if (!this.#io) throw new Error("closed");
		return {
			alarmPending: Boolean(this.#io.readUint8(Register.FLAGS) & 8),
			alarmEnabled: Boolean(this.#io.readUint8(Register.CONTROL0) & 8)
		};
	}
	verifyAlarm() {
		const io = this.#io;
		if (!io) throw new Error("closed");
		if (this.#alarm === undefined || !(io.readUint8(Register.CONTROL0) & 8) ||
			!(io.readUint8(Register.EXTENSION) & 8) || (io.readUint8(Register.FLAGS) & 0x0A))
			return false;
		const now = this.time;
		if (now === undefined || now >= this.#alarm) return false;
		const b = new Uint8Array(3);
		io.readBuffer(Register.ALARM, b);
		const date = new Date(this.#alarm);
		return b[0] === toBCD(date.getUTCMinutes()) &&
			b[1] === toBCD(date.getUTCHours()) && b[2] === toBCD(date.getUTCDate());
	}
	#setAlarm(value) {
		const io = this.#io;
		let alarm;
		if (value !== 0) {
			if (typeof value !== "number" || !Number.isFinite(value))
				throw new RangeError("invalid alarm");
			const now = this.time;
			alarm = Math.ceil(value / 60_000) * 60_000;
			// No month/year comparator: a longer horizon can match an earlier month.
			if (now === undefined || value <= now || alarm - now >= 28 * 86_400_000 ||
				alarm >= Date.UTC(2100, 0, 1))
				throw new RangeError("alarm must be in the next 28 days");
		}
		const control = io.readUint8(Register.CONTROL0) & ~8;
		io.writeUint8(Register.CONTROL0, control);
		this.#alarm = undefined;
		if (alarm !== undefined) {
			const date = new Date(alarm);
			io.writeUint8(Register.EXTENSION, io.readUint8(Register.EXTENSION) | 8);
			io.writeBuffer(Register.ALARM, Uint8Array.of(
				toBCD(date.getUTCMinutes()), toBCD(date.getUTCHours()), toBCD(date.getUTCDate())));
		}
		// Clear AF only; a timer or voltage fault may have arrived concurrently.
		io.writeUint8(Register.FLAGS, 0xB7);
		if (alarm !== undefined) {
			const now = this.time;
			if (now === undefined || now >= alarm)
				throw new RangeError("alarm deadline elapsed while configuring");
			try {
				io.writeUint8(Register.CONTROL0, control | 8);
			}
			catch (e) {
				// A failed acknowledgement can still have enabled the comparator.
				try { io.writeUint8(Register.CONTROL0, control); } catch {}
				throw e;
			}
			this.#alarm = alarm;
		}
	}
	get time() {
		const io = this.#io;
		if (!io)
			throw new Error("closed");
		if ((io.readUint8(Register.FLAGS) & 2) || (io.readUint8(Register.CONTROL0) & 0x40))
			return undefined;
		const b = this.#buffer;
		io.readBuffer(Register.TIME, b);
		if (io.readUint8(Register.FLAGS) & 2)
			return undefined;
		const second = fromBCD(b[0] & 0x7F);
		const minute = fromBCD(b[1] & 0x7F);
		const hour = fromBCD(b[2] & 0x3F);
		const day = fromBCD(b[4] & 0x3F);
		const month = fromBCD(b[5] & 0x1F);
		const year = fromBCD(b[6]);
		const weekday = b[3];
		if (!weekday || weekday > 64 || (weekday & (weekday - 1)) ||
			second > 59 || minute > 59 || hour > 23 || day < 1 || day > 31 ||
			month < 1 || month > 12 || year > 99)
			return undefined;
		const value = Date.UTC(2000 + year, month - 1, day, hour, minute, second);
		const date = new Date(value);
		if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
			return undefined;
		return value;
	}
	set time(value) {
		const io = this.#io;
		if (!io)
			throw new Error("closed");
		if (typeof value !== "number" || !Number.isFinite(value) ||
			value < Date.UTC(2000, 0, 1) || value >= Date.UTC(2100, 0, 1))
			throw new RangeError("time must be in 2000..2099");
		// Clock changes invalidate the month/year implied by the armed deadline.
		this.#alarm = undefined;
		this.#setAlarm(0);
		const date = new Date(value);
		const b = this.#buffer;
		b[0] = toBCD(date.getUTCSeconds());
		b[1] = toBCD(date.getUTCMinutes());
		b[2] = toBCD(date.getUTCHours());
		b[3] = 1 << date.getUTCDay();
		b[4] = toBCD(date.getUTCDate());
		b[5] = toBCD(date.getUTCMonth() + 1);
		b[6] = toBCD(date.getUTCFullYear() - 2000);
		const control = io.readUint8(Register.CONTROL0) & ~0xC0;
		io.writeUint8(Register.CONTROL0, control | 0x40);
		// A failed write leaves STOP set: a partial calendar must not look valid.
		io.writeBuffer(Register.TIME, b);
		// Flags are write-zero-to-clear. Ones preserve asynchronous pending events.
		io.writeUint8(Register.FLAGS, 0xBD);
		io.writeUint8(Register.CONTROL0, control);
	}
	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

function toBCD(value) {
	return (Math.floor(value / 10) << 4) | (value % 10);
}
function fromBCD(value) {
	if ((value & 15) > 9 || (value >> 4) > 9)
		return 255;
	return (value >> 4) * 10 + (value & 15);
}
export default RX8130;
