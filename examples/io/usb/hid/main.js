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

const hid = new device.USBHID.default.io({
	...device.USBHID.default,
	onReadable(reports) {
		while (reports--) {
			const report = new Uint8Array(this.read());
			trace(`${this.protocol}: ${report}\n`);
		}
	},
	onError(error) {
		trace(`USB HID error: ${error}\n`);
	}
});

trace(`Connect a USB ${hid.protocol} to the Tab5 USB-A port.\n`);
