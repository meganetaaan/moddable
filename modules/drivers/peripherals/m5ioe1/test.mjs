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
const load = async path => {
	const source = await readFile(new URL(path, import.meta.url), "utf8");
	return (await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"))).default;
};
class Bus {
	static current;
	r = new Uint8Array(256);
	constructor(options) { this.options = options; Bus.current = this; }
	readUint8(r) { return this.r[r]; }
	writeUint8(r, value) { this.r[r] = value; }
	close() { this.closed = true; }
}
const IOE = await load("./m5ioe1.js");
const ioe = new IOE({io: Bus});
const b = Bus.current;
assert.equal(b.options.address, 0x4F);
assert.equal(b.options.hz, 100000);
for (const pin of [1, 8, 9, 14]) {
	const bank = (pin - 1) >> 3, mask = 1 << ((pin - 1) & 7);
	b.r[3 + bank] = 0;
	b.r[0x13 + bank] = 255;
	ioe.configure({pin});
	assert.equal(b.r[3 + bank], mask);
	assert.equal(b.r[0x13 + bank], 255 & ~mask);
	b.r[5 + bank] = 255;
	ioe.write(pin, 0);
	assert.equal(b.r[5 + bank], 255 & ~mask);
	ioe.write(pin, 1);
	assert.equal(b.r[5 + bank], 255);
	b.r[7 + bank] = mask;
	assert.equal(ioe.read(pin), 1);
	b.r[7 + bank] = 0;
	assert.equal(ioe.read(pin), 0);
}
// M5Unified M5IOE1_Class.hpp: PWM channels route to IO9, IO8, IO11, IO10.
for (const [pin, highRegister] of [[9, 0x1C], [8, 0x1E], [11, 0x20], [10, 0x22]]) {
	for (const reg of [0x1C,0x1E,0x20,0x22]) b.r[reg] = 0xCF;
	ioe.configure({pin});
	for (const reg of [0x1C,0x1E,0x20,0x22])
		assert.equal(b.r[reg], reg === highRegister ? 0x4F : 0xCF);
}
b.r[0x22] = 0xCF;
ioe.configure({pin: 12});
assert.equal(b.r[0x22], 0xCF, "IO12 must not change the IO10 amplifier PWM");
for (const pin of [0, 15, 16, 1.5, NaN]) {
	assert.throws(() => ioe.configure({pin}), RangeError);
	assert.throws(() => ioe.read(pin), RangeError);
	assert.throws(() => ioe.write(pin, 1), RangeError);
}
ioe.close(); ioe.close(); assert.equal(b.closed, true);
const PM1 = await load("../m5pm1/m5pm1.js");
const power = new PM1({io: Bus});
assert.equal(Bus.current.options.address, 0x6E);
assert.equal(Bus.current.r[9], 0);
assert.equal(Bus.current.r[10], 0);
assert.equal(Bus.current.r[6], 0x17);
assert.equal(Bus.current.r[0x10], 0); // Never program charge-current GPIO3.
power.close(); power.close();
console.log("PM1/IOE1 mock tests passed");
