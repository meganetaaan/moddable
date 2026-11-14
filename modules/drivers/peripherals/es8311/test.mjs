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



import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const delays = [];
globalThis.__codecTimer = {delay(ms) { delays.push(ms); }};
const source = (await readFile(new URL("./es8311.js", import.meta.url), "utf8")).replace('import Timer from "timer";', "const Timer = globalThis.__codecTimer;");
const {default: Codec} = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
class Bus {
	static current;
	registers = new Uint8Array(256);
	constructor(options) { Bus.current = this; this.options = options; }
	writeUint8(r, value) { if (this.fail) throw new Error("I2C fault"); this.registers[r] = value; }
	close() { this.closed = true; }
}
const codec = new Codec({io: Bus});
const bus = Bus.current;
assert.equal(bus.options.address, 0x18);
codec.configure({input: true});
assert.equal(bus.registers[1], 0xBA);
assert.equal(bus.registers[0x14], 0x17);
assert.equal(bus.registers[0x17], 0xCB);
codec.start();
assert.deepEqual(delays, [30, 30, 30]);
codec.stop();
assert.equal(bus.registers[0x0D], 0xFC);
codec.configure({output: true});
assert.equal(bus.registers[1], 0xB5);
assert.equal(bus.registers[0x12], 0);
codec.stop();
assert.equal(bus.registers[0x12], 2);
bus.fail = true;
assert.throws(() => codec.close(), /I2C fault/);
assert.equal(bus.closed, true);
codec.close();
delete globalThis.__codecTimer;
console.log("ES8311 lifecycle mock tests passed");
