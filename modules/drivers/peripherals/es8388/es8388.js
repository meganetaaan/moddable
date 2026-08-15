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
	Everest Semiconductor ES8388 audio codec
	https://github.com/espressif/esp-adf/tree/master/components/esp_codec_dev/device/es8388
*/

const DAC_INITIALIZATION = Uint8Array.of(
	0x19, 0x04,	// mute DAC
	0x01, 0x50,
	0x02, 0x00,
	0x35, 0xA0,
	0x37, 0xD0,
	0x39, 0xD0,
	0x08, 0x00,	// I2S slave
	0x04, 0xC0,
	0x00, 0x12,
	0x17, 0x18,	// 16-bit I2S
	0x18, 0x02,	// 256 x MCLK
	0x26, 0x00,
	0x27, 0x90,
	0x2A, 0x90,
	0x2B, 0x80,
	0x2D, 0x00,
	0x1A, 0x00,
	0x1B, 0x00,
	0x2E, 0x1E,
	0x2F, 0x1E,
	0x30, 0x00,
	0x31, 0x00,
	0x04, 0x3C,
	0x19, 0x00	// unmute DAC
);

export default function configureES8388(options) {
	const sensor = options?.sensor;
	if ("function" !== typeof sensor?.io)
		throw new TypeError("invalid sensor");

	const io = new sensor.io({
		hz: 400_000,
		address: 0x10,
		...sensor
	});
	try {
		for (let i = 0; i < DAC_INITIALIZATION.length; i += 2)
			io.writeUint8(DAC_INITIALIZATION[i], DAC_INITIALIZATION[i + 1]);
	}
	finally {
		io.close();
	}
}
