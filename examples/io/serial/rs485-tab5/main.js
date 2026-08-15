/*
 * Copyright (c) 2026  Moddable Tech, Inc.
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

import Timer from "timer";

const message = ArrayBuffer.fromString("Hello M5Stack!\n");
const serial = new device.Serial.rs485.io({
	...device.Serial.rs485,
	baud: 115200,
	onReadable() {
		const data = this.read();
		if (data)
			trace(`RS-485 received: ${String.fromArrayBuffer(data)}`);
	}
});

function send() {
	serial.write(message);
	trace("RS-485 sent\n");
}

send();
Timer.repeat(send, 1000);
