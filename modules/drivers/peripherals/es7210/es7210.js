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
	Everest Semiconductor ES7210 audio ADC
	https://github.com/m5stack/M5Unified/blob/master/src/M5Unified.cpp
*/

const MICROPHONE_INITIALIZATION = Uint8Array.of(
	0x00, 0xFF,	// reset
	0x00, 0x41,
	0x01, 0x1F,
	0x06, 0x00,
	0x07, 0x20,
	0x08, 0x10,
	0x09, 0x30,
	0x0A, 0x30,
	0x20, 0x0A,
	0x21, 0x2A,
	0x22, 0x0A,
	0x23, 0x2A,
	0x02, 0xC1,
	0x04, 0x01,
	0x05, 0x00,
	0x11, 0x60,	// 16-bit I2S
	0x40, 0x42,
	0x41, 0x70,
	0x42, 0x70,
	0x43, 0x1B,
	0x44, 0x1B,
	0x45, 0x00,
	0x46, 0x00,
	0x47, 0x00,
	0x48, 0x00,
	0x49, 0x00,
	0x4A, 0x00,
	0x4B, 0x00,	// microphones 1 and 2 on
	0x4C, 0xFF,	// microphones 3 and 4 off
	0x01, 0x14
);

export default function configureES7210(options) {
	const sensor = options?.sensor;
	if ("function" !== typeof sensor?.io)
		throw new TypeError("invalid sensor");

	const io = new sensor.io({
		hz: 400_000,
		address: 0x40,
		...sensor
	});
	try {
		for (let i = 0; i < MICROPHONE_INITIALIZATION.length; i += 2)
			io.writeUint8(MICROPHONE_INITIALIZATION[i], MICROPHONE_INITIALIZATION[i + 1]);
	}
	finally {
		io.close();
	}
}
