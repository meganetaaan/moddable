/*
 * Copyright (c) 2023  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Tools.
 * 
 *   The Moddable SDK Tools is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 * 
 *   The Moddable SDK Tools is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 * 
 *   You should have received a copy of the GNU General Public License
 *   along with the Moddable SDK Tools.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

import Bitmap from "commodetto/Bitmap";
import {Digest} from "crypt";

export default class ChecksumOut {
	#digest = new Digest("MD5");
	#continue;
	#capture;
	#captureNext;
	#captureCurrent;
	#captureX = 0;
	#captureY = 0;
	#captureWidth = 0;
	#captureHeight = 0;
	#captureBuffers = [];
	#captureByteLength = 0;
	#full;
	#show;
	#screen = globalThis.screen;

	constructor(options) {
		Object.defineProperty(this, "width", {value: options.width});
		Object.defineProperty(this, "height", {value: options.height});
		Object.defineProperty(this, "pixelFormat", {value: options.pixelFormat ?? Bitmap.RGB565LE});
	}
	begin(x, y, width, height) {
		if ("object" === typeof x)
			({x, y, width, height} = x);

		this.#beginCapture(x, y, width, height);

		this.#show?.begin(x, y, width, height);

		if (!this.#continue)
			this.#digest.reset();
		this.#continue = false;
		
		this.#digest.write(Int32Array.of(x, y, width, height).buffer);
	}
	send(pixels, offset, byteLength) {
		this.#show?.send(pixels, offset, byteLength);

		if (offset || (byteLength !== pixels.byteLength))
			pixels = new Uint8Array(pixels, offset, byteLength);

		if (this.#captureCurrent && pixels.byteLength) {
			const copy = new Uint8Array(pixels.byteLength);
			copy.set(pixels);
			this.#captureBuffers.push(copy);
			this.#captureByteLength += copy.byteLength;
		}
		
		this.#digest.write(pixels);
	}
	end() {
		this.#show?.end();

		const bytes = new Uint8Array(this.#digest.close());
		const checksum = [];
		for (let i = 0, length = bytes.length; i < length; i++)
			checksum.push(bytes[i].toString(16).padStart(2, "0"));
		this.checksum = checksum.join("");
		this.#continue = false;
		this.#emitCapture();
	}
	continue() {
		if (this.#show)
			this.#show.continue();

		this.#continue = true
	}
	captureImage(path, options = undefined) {
		this.#capture = this.#normalizeCapture(path, options);
	}
	captureNext(path, options = undefined) {
		this.#captureNext = this.#normalizeCapture(path, options);
	}
	clearCapture() {
		this.#capture = undefined;
		this.#captureNext = undefined;
		this.#captureCurrent = undefined;
		this.#captureBuffers = [];
		this.#captureByteLength = 0;
	}
	adaptInvalid(r) {
		if (this.#full)
			r.set(0, 0, this.width, this.height);
		else
			this.#show?.adaptInvalid(r);
	}
	pixelsToBytes(count) {
		return ((Bitmap.depth(this.pixelFormat) * count) + 7) >> 3;
	}
	
	configure(options) {
		if ("full" in options)
			this.#full = options.full;
		if ("show" in options)
			this.#show = options.show ? this.#screen : null;
	}

	#normalizeCapture(path, options) {
		if ("object" === typeof path) {
			options = path;
			path = options.path;
		}
		if ("string" !== typeof path || !path.length)
			throw new Error("captureImage path is required");

		options ??= {};
		const chunkSize = Number(options.chunkSize);
		return {
			path,
			chunkSize: (chunkSize > 0) ? chunkSize : 768
		};
	}
	#beginCapture(x, y, width, height) {
		const capture = this.#captureNext ?? this.#capture;
		if (!capture) {
			this.#captureCurrent = undefined;
			this.#captureBuffers = [];
			this.#captureByteLength = 0;
			return;
		}

		if (this.#captureNext)
			this.#captureNext = undefined;

		this.#captureCurrent = capture;
		this.#captureX = (undefined === x) ? 0 : (x | 0);
		this.#captureY = (undefined === y) ? 0 : (y | 0);
		this.#captureWidth = (undefined === width) ? this.width : (width | 0);
		this.#captureHeight = (undefined === height) ? this.height : (height | 0);
		this.#captureBuffers = [];
		this.#captureByteLength = 0;
	}
	#emitCapture() {
		const capture = this.#captureCurrent;
		if (!capture)
			return;

		this.#captureCurrent = undefined;
		if (!this.#captureByteLength)
			return;

		const header = JSON.stringify({
			type: "testmc-capture",
			path: capture.path,
			width: this.#captureWidth,
			height: this.#captureHeight,
			x: this.#captureX,
			y: this.#captureY,
			pixelFormat: this.#pixelFormatName()
		});

		trace("|:@capture ");
		trace(header);
		trace(":|\n");

		const chunkSize = capture.chunkSize;
		for (let i = 0; i < this.#captureBuffers.length; i++) {
			const source = this.#captureBuffers[i];
			for (let offset = 0; offset < source.byteLength; offset += chunkSize) {
				const end = Math.min(offset + chunkSize, source.byteLength);
				const chunk = source.subarray(offset, end);
				trace("|:");
				trace(chunk.toBase64());
				trace(":|\n");
			}
		}

		trace("|:@close:|\n");
		this.#captureBuffers = [];
		this.#captureByteLength = 0;
	}
	#pixelFormatName() {
		switch (this.pixelFormat) {
		case Bitmap.RGB565LE:
			return "rgb565le";
		case Bitmap.RGB565BE:
			return "rgb565be";
		default:
			throw new Error(`captureImage unsupported pixel format: ${this.pixelFormat}`);
		}
	}
}
