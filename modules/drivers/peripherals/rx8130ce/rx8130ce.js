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
	Epson RX8130CE Real-Time Clock
	https://download.epsondevice.com/td/pdf/app/RX8130CE_en.pdf
*/

const Register = Object.freeze({
	TIME: 0x10,
	ALARM: 0x17,
	TIMER: 0x1A,
	EXTENSION: 0x1C,
	FLAG: 0x1D,
	CONTROL: 0x1E,
	POWER: 0x1F
});

const Bit = Object.freeze({
	WADA: 0x08,
	TSEL: 0x07,
	TSEL_1HZ: 0x02,
	TE: 0x10,
	AF: 0x08,
	TF: 0x10,
	VLF: 0x02,
	STOP: 0x40,
	AIE: 0x08,
	TIE: 0x10,
	CHGEN: 0x20,
	INIEN: 0x10
});

const AlarmRange = 31 * 24 * 60 * 60 * 1000;
const TimerRange = 0xFFFF * 1000;

function decToBcd(value) {
	return (Math.idiv(value, 10) << 4) | Math.imod(value, 10);
}

function bcdToDec(value) {
	return (Math.idiv(value, 16) * 10) + Math.imod(value, 16);
}

function nextAlarm(now, day, hours, minutes) {
	const date = new Date(now);
	let year = date.getUTCFullYear();
	let month = date.getUTCMonth();

	for (let i = 0; i < 13; i++) {
		const value = Date.UTC(year, month, day, hours, minutes);
		const candidate = new Date(value);
		if ((candidate.getUTCMonth() === month) && (value >= now))
			return value;
		if (++month > 11) {
			month = 0;
			year++;
		}
	}
}

class RX8130CE {
	#io;
	#buffer = new Uint8Array(7);

	constructor(options) {
		if ("target" in options)
			this.target = options.target;

		try {
			const {clock} = options;
			const io = this.#io = new clock.io({
				hz: 400_000,
				address: 0x32,
				...clock
			});
			io.readUint8(Register.POWER);

			if (undefined !== options.backup) {
				const backup = options.backup;
				if (!backup || ("object" !== typeof backup))
					throw new TypeError("invalid backup");
				let value = io.readUint8(Register.POWER);
				if ("charge" in backup) {
					if ("boolean" !== typeof backup.charge)
						throw new TypeError("invalid backup charge");
					value = backup.charge ? value | Bit.CHGEN : value & ~Bit.CHGEN;
				}
				if ("powerSwitch" in backup) {
					if ("boolean" !== typeof backup.powerSwitch)
						throw new TypeError("invalid backup powerSwitch");
					value = backup.powerSwitch ? value | Bit.INIEN : value & ~Bit.INIEN;
				}
				io.writeUint8(Register.POWER, value);
			}
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
		const hasTimer = "timer" in options;
		let timer;
		if (hasTimer) {
			timer = Number(options.timer);
			if (!Number.isFinite(timer) || (timer < 0) || (timer > TimerRange) || (timer && ((timer < 1000) || (timer % 1000))))
				throw new RangeError("invalid timer");
		}
		if (!("alarm" in options)) {
			if (hasTimer)
				this.#configureTimer(timer);
			return;
		}

		const io = this.#io;
		const alarm = Number(options.alarm);
		if (!Number.isFinite(alarm))
			throw new RangeError("invalid alarm");
		if (0 === alarm) {
			io.writeUint8(Register.CONTROL, io.readUint8(Register.CONTROL) & ~Bit.AIE);
			if (hasTimer)
				this.#configureTimer(timer);
			return;
		}

		const now = this.time;
		if ((undefined === now) || (alarm < now) || ((alarm - now) > AlarmRange))
			throw new RangeError("invalid alarm");

		const future = new Date(alarm);
		const control = io.readUint8(Register.CONTROL) & ~Bit.AIE;
		io.writeUint8(Register.CONTROL, control);
		io.writeUint8(Register.FLAG, io.readUint8(Register.FLAG) & ~Bit.AF);
		io.writeUint8(Register.EXTENSION, io.readUint8(Register.EXTENSION) | Bit.WADA);
		io.writeBuffer(Register.ALARM, Uint8Array.of(
			decToBcd(future.getUTCMinutes()),
			decToBcd(future.getUTCHours()),
			decToBcd(future.getUTCDate())
		));
		io.writeUint8(Register.CONTROL, control | Bit.AIE);
		if (hasTimer)
			this.#configureTimer(timer);
	}
	#configureTimer(timer) {
		const io = this.#io;
		const control = io.readUint8(Register.CONTROL) & ~Bit.TIE;
		const extension = io.readUint8(Register.EXTENSION) & ~Bit.TE;
		io.writeUint8(Register.CONTROL, control);
		io.writeUint8(Register.EXTENSION, extension);
		io.writeUint8(Register.FLAG, io.readUint8(Register.FLAG) & ~Bit.TF);
		if (!timer)
			return;

		const seconds = timer / 1000;
		const buffer = this.#buffer;
		buffer[0] = seconds;
		buffer[1] = seconds >> 8;
		io.writeBuffer(Register.TIMER, buffer.subarray(0, 2));
		io.writeUint8(Register.EXTENSION, (extension & ~Bit.TSEL) | Bit.TSEL_1HZ | Bit.TE);
		io.writeUint8(Register.CONTROL, control | Bit.TIE);
	}
	get configuration() {
		const io = this.#io;
		const control = io.readUint8(Register.CONTROL);
		let timer = 0;
		if ((control & Bit.TIE) && (io.readUint8(Register.EXTENSION) & Bit.TE)) {
			const buffer = this.#buffer;
			io.readBuffer(Register.TIMER, buffer.subarray(0, 2));
			timer = (buffer[0] | (buffer[1] << 8)) * 1000;
		}
		if (!(control & Bit.AIE))
			return {alarm: 0, timer};

		const now = this.time;
		if (undefined === now)
			return {alarm: undefined, timer};
		const alarm = this.#buffer;
		io.readBuffer(Register.ALARM, alarm.subarray(0, 3));
		return {alarm: nextAlarm(now,
			bcdToDec(alarm[2] & 0x3F),
			bcdToDec(alarm[1] & 0x3F),
			bcdToDec(alarm[0] & 0x7F)), timer};
	}
	get time() {
		const io = this.#io;
		if ((io.readUint8(Register.FLAG) & Bit.VLF) || (io.readUint8(Register.CONTROL) & Bit.STOP))
			return undefined;

		const value = this.#buffer;
		io.readBuffer(Register.TIME, value);
		return Date.UTC(
			2000 + bcdToDec(value[6]),
			bcdToDec(value[5] & 0x1F) - 1,
			bcdToDec(value[4] & 0x3F),
			bcdToDec(value[2] & 0x3F),
			bcdToDec(value[1] & 0x7F),
			bcdToDec(value[0] & 0x7F));
	}
	set time(value) {
		value = Number(value);
		const date = new Date(value);
		const year = date.getUTCFullYear();
		if (!Number.isFinite(value) || (year < 2000) || (year > 2099))
			throw new RangeError("invalid time");

		const buffer = this.#buffer;
		buffer[0] = decToBcd(date.getUTCSeconds());
		buffer[1] = decToBcd(date.getUTCMinutes());
		buffer[2] = decToBcd(date.getUTCHours());
		buffer[3] = 1 << date.getUTCDay();
		buffer[4] = decToBcd(date.getUTCDate());
		buffer[5] = decToBcd(date.getUTCMonth() + 1);
		buffer[6] = decToBcd(year % 100);

		const io = this.#io;
		io.writeBuffer(Register.TIME, buffer);
		io.writeUint8(Register.CONTROL, io.readUint8(Register.CONTROL) & ~Bit.STOP);
		io.writeUint8(Register.FLAG, io.readUint8(Register.FLAG) & ~Bit.VLF);
	}

	static {
		this.prototype[Symbol.dispose] = this.prototype.close;
	}
}

export default RX8130CE;
