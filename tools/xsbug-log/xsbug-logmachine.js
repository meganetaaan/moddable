/*
 * Copyright (c) 2022-2024  Moddable Tech, Inc.
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

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Buffer } = require('node:buffer');

const { Machine } = require('./xsbug-machine.js');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const kChannels = new Set(["build", "runtime", "test", "error", "system"]);
let gCRC32Table;

function getCRC32Table() {
	if (gCRC32Table)
		return gCRC32Table;
	gCRC32Table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++)
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		gCRC32Table[n] = c >>> 0;
	}
	return gCRC32Table;
}

function crc32(buffer) {
	const table = getCRC32Table();
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < buffer.length; i++)
		crc = table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(name, data) {
	const nameBuffer = Buffer.from(name, 'ascii');
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const crcBuffer = Buffer.alloc(4);
	crcBuffer.writeUInt32BE(crc32(Buffer.concat([nameBuffer, data])), 0);
	return Buffer.concat([length, nameBuffer, data, crcBuffer]);
}

function rgb565ToRGBA(raw, width, height, pixelFormat) {
	const expectedBytes = width * height * 2;
	if (raw.length < expectedBytes)
		throw new Error(`capture bytes too short (${raw.length} < ${expectedBytes})`);

	const rgba = Buffer.alloc(width * height * 4);
	let inOffset = 0;
	let outOffset = 0;
	const littleEndian = (pixelFormat !== "rgb565be");

	for (let i = 0; i < width * height; i++) {
		const value = littleEndian
			? (raw[inOffset] | (raw[inOffset + 1] << 8))
			: ((raw[inOffset] << 8) | raw[inOffset + 1]);
		inOffset += 2;

		const r5 = (value >> 11) & 0x1F;
		const g6 = (value >> 5) & 0x3F;
		const b5 = value & 0x1F;

		rgba[outOffset++] = (r5 << 3) | (r5 >> 2);
		rgba[outOffset++] = (g6 << 2) | (g6 >> 4);
		rgba[outOffset++] = (b5 << 3) | (b5 >> 2);
		rgba[outOffset++] = 0xFF;
	}

	return rgba;
}

function encodePNG(raw, width, height, pixelFormat) {
	const rgba = rgb565ToRGBA(raw, width, height, pixelFormat);
	const scanlineLength = 1 + (width * 4);
	const scanlines = Buffer.alloc(scanlineLength * height);
	for (let y = 0; y < height; y++) {
		const rowStart = y * scanlineLength;
		scanlines[rowStart] = 0;
		rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;	// bit depth
	ihdr[9] = 6;	// color type RGBA
	ihdr[10] = 0;	// compression
	ihdr[11] = 0;	// filter
	ihdr[12] = 0;	// interlace

	const idat = zlib.deflateSync(scanlines, { level: 9 });
	return Buffer.concat([
		PNG_SIGNATURE,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", idat),
		pngChunk("IEND", Buffer.alloc(0))
	]);
}

class LogMachine extends Machine {
	view = {};
	log = "";
	binaryOutput = null;
	capture = null;
	captureDiscard = false;
	#format;
	#include;
	#exclude;
	#strictChannel;

	constructor(input, output, options = {}) {
		super(input, output);

		this.#format = (options.format === "jsonl") ? "jsonl" : "text";
		this.#strictChannel = !!options.strictChannel;
		this.#include = options.channel ? new Set(options.channel.filter(item => kChannels.has(item))) : null;
		this.#exclude = options.exclude ? new Set(options.exclude.filter(item => kChannels.has(item))) : null;
	}

	#resolveChannel(channel) {
		if (kChannels.has(channel))
			return channel;
		if (this.#strictChannel)
			return null;
		return "runtime";
	}
	#shouldPrint(channel) {
		if (!channel)
			return false;
		if (this.#include && !this.#include.has(channel))
			return false;
		if (this.#exclude && this.#exclude.has(channel))
			return false;
		return true;
	}
	#emit(channel, message, severity = "info", extra = undefined) {
		channel = this.#resolveChannel(channel);
		if (!this.#shouldPrint(channel))
			return;

		if (this.#format === "jsonl") {
			const payload = {
				ts: new Date().toISOString(),
				channel,
				severity,
				message,
				source: "xsbug-log"
			};
			if (extra && ("object" === typeof extra))
				Object.assign(payload, extra);
			console.log(JSON.stringify(payload));
		}
		else {
			console.log(message);
		}
	}
	#guessChannel(message) {
		if (/(^|\b)(FAIL|PASS|SKIP|REPORT|TEST262|test262)(\b|$)/.test(message))
			return "test";
		if (/(error|exception|assert|failed|panic|timeout|unhandled)/i.test(message))
			return "error";
		return "runtime";
	}

	#capturePath(target) {
		let result = target ?? "build/tmp/snapshot.png";
		if (!result.endsWith(".png"))
			result += ".png";
		if (!path.isAbsolute(result))
			result = path.join(process.env.MODDABLE ?? process.cwd(), result);
		return result;
	}
	#captureBegin(payload) {
		this.capture = null;
		this.captureDiscard = false;

		let metadata;
		try {
			metadata = JSON.parse(payload);
		}
		catch {
			this.#emit("system", `#xsbug-log invalid capture metadata: ${payload}`, "error");
			this.captureDiscard = true;
			return;
		}

		const width = metadata.width | 0;
		const height = metadata.height | 0;
		if ((width <= 0) || (height <= 0)) {
			this.#emit("system", `#xsbug-log invalid capture size: ${width}x${height}`, "error");
			this.captureDiscard = true;
			return;
		}

		const pixelFormat = metadata.pixelFormat ?? "rgb565le";
		if ((pixelFormat !== "rgb565le") && (pixelFormat !== "rgb565be")) {
			this.#emit("system", `#xsbug-log unsupported capture pixel format: ${pixelFormat}`, "error");
			this.captureDiscard = true;
			return;
		}

		this.capture = {
			width,
			height,
			pixelFormat,
			outputPath: this.#capturePath(metadata.path),
			buffers: [],
			byteLength: 0
		};
	}
	#captureAppend(payload) {
		if (this.captureDiscard)
			return true;
		const capture = this.capture;
		if (!capture)
			return false;
		const bytes = Buffer.from(payload, "base64");
		if (bytes.length) {
			capture.buffers.push(bytes);
			capture.byteLength += bytes.length;
		}
		return true;
	}
	#captureEnd() {
		if (this.captureDiscard) {
			this.captureDiscard = false;
			return true;
		}
		const capture = this.capture;
		this.capture = null;
		if (!capture)
			return false;

		const raw = Buffer.concat(capture.buffers, capture.byteLength);
		let png;
		try {
			png = encodePNG(raw, capture.width, capture.height, capture.pixelFormat);
		}
		catch (error) {
			this.#emit("system", `#xsbug-log capture error: ${error.message}`, "error");
			return true;
		}

		fs.mkdirSync(path.dirname(capture.outputPath), { recursive: true });
		fs.writeFileSync(capture.outputPath, png);
		this.#emit("system", `#xsbug-log capture: ${capture.outputPath}`, "info", {
			capturePath: capture.outputPath,
			width: capture.width,
			height: capture.height,
			pixelFormat: capture.pixelFormat
		});
		return true;
	}

	onTitleChanged(title, tag) {
		super.onTitleChanged(title, tag);
		
		if (title && (title !== "mcsim"))
			this.#emit("system", `#xsbug-log connected to "${title}"`, "info", { title });

		this.doSetAllBreakpoint([], false, true);		// break on exceptions
	}
	onLogged(path, line, data) {
		this.log += data;
		if (this.log.endsWith("\n")) {
			if (this.log.startsWith("|:") && this.log.endsWith(":|\n")) {
				const payload = this.log.slice(2, this.log.length - 3);
				if (payload.startsWith("@capture ")) {
					this.#captureBegin(payload.slice(9));
				}
				else if (payload.startsWith("@filename ")) {
					const parts = payload.split(" ");
					if (parts[1])
						this.binaryName = parts[1];
				}
				else if (payload.startsWith("@close")) {
					if (!this.#captureEnd()) {
						if (this.binaryOutput) {
							fs.closeSync(this.binaryOutput);
							this.#emit("system", `#xsbug-log capture: ${this.binaryPath}`);
						}
						delete this.binaryOutput;
						delete this.binaryName;
						delete this.binaryPath;
					}
				}
				else if (payload.startsWith("@")) {
					this.#emit("system", `ignoring ${payload}`);
				}
				else if (payload) {
					if (!this.#captureAppend(payload)) {
						if (!this.binaryOutput) {
							const root = process.env.MODDABLE ?? process.cwd();
							this.binaryPath = path.join(root, "build/tmp", this.binaryName ? this.binaryName : "log.bin");
							fs.mkdirSync(path.dirname(this.binaryPath), { recursive: true });
							this.binaryOutput = fs.openSync(this.binaryPath, "w+");
						}
						fs.writeSync(this.binaryOutput, Buffer.from(payload, "base64"), 0);
					}
				}
			}
			else {
				const message = this.log.slice(0, this.log.length - 1);
				const channel = this.#guessChannel(message);
				this.#emit(channel, message, channel === "error" ? "error" : "info");
			}
			this.log = "";
		}
	}
	onBroken(path, line, text) {
		const frames = this.view.frames ?? [];
		frames.forEach((frame, index) => {
			let line = "  #" + index + ": " + frame.name;
			if (frame.path)
				line += " " + frame.path + ":" + frame.line;
			this.#emit("error", line, "error");
		});

		super.onBroken(path, line, text);
	}
	onViewChanged(name, items) {
		this.view[name] = items;
	}
}

exports.LogMachine = LogMachine;
