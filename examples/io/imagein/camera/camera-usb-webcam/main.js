/*
 * Copyright (c) 2024-2026  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

function startWebcam(i2c) @ "xs_cores3WebcamStart";

export default function() {
	const cameraBus = new device.io.I2C({
		...device.i2c.internal,
		address: 0x21,
		hz: 100_000
	});
	try {
		startWebcam(cameraBus);
	}
	finally {
		cameraBus.close();
	}
}
