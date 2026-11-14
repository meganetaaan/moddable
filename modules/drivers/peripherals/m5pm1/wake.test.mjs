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
const source = await readFile(new URL("./m5pm1.js", import.meta.url), "utf8");
const {default: Power} = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
class Bus {
	static current;
	r = new Uint8Array(256);
	writes = [];
	constructor() { Bus.current = this; }
	readUint8(r) { return this.r[r]; }
	writeUint8(r,v) {
		if (this.fail === r) throw new Error("I2C fault");
		this.writes.push([r,v]);
		if (this.ignore !== r) this.r[r] = v;
	}
	close() {}
}
const pm = new Power({io: Bus}), b = Bus.current;
b.r[4] = 4;
b.r[0x12] = 1;
b.r[0x10] = 0xFE;
b.r[0x14] = 0xFC;
b.r[0x16] = 0xFC;
b.r[0x18] = 0xFE;
b.r[0x19] = 0xFE;
pm.configureWake({pin: 0});
assert.equal(pm.verifyWake({pin: 0}), true);
assert.equal(b.r[0x10], 0xFE);
assert.equal(b.r[0x14], 0xFC);
assert.equal(b.r[0x16], 0xFE);
assert.equal(b.r[0x18], 0xFF);
assert.equal(b.r[0x19], 0xFE);
assert.equal(b.writes.some(([r]) => r === 0x0C), false);
for (const pin of [1, -1, 5, 0.5, "0"]) assert.throws(() => pm.configureWake({pin}), RangeError);
assert.throws(() => pm.configureWake({pin: 0, edge: "both"}), RangeError);
for (const power of [0, 1, 2, 3, 5, 6, 7]) {
	b.r[4] = power;
	assert.throws(() => pm.shutdown({wakePin: 0}), /battery/);
}
b.r[4] = 4;
b.r[0x12] = 0;
assert.throws(() => pm.shutdown({wakePin: 0}), /wake not ready/);
b.r[0x12] = 1;
b.r[0x18] &= ~1;
assert.throws(() => pm.shutdown({wakePin: 0}), /wake not ready/);
assert.equal(b.writes.some(([r]) => r === 0x0C), false);
pm.configureWake({pin: 0});
pm.shutdown({wakePin: 0});
assert.deepEqual(b.writes.at(-1), [0x0C, 0xA1]);
pm.configureWake({pin: 0, enabled: false});
assert.equal(b.r[0x18] & 1, 0);
b.ignore = 0x18;
assert.throws(() => pm.configureWake({pin: 0}), /readback/);
b.ignore = undefined;
for (const reg of [0x18, 0x10, 0x14, 0x16, 0x19]) {
	b.fail = reg;
	const count = b.writes.filter(([r]) => r === 0x0C).length;
	assert.throws(() => pm.configureWake({pin: 0}), /I2C fault/);
	assert.equal(b.writes.filter(([r]) => r === 0x0C).length, count);
}
b.fail = undefined;
pm.configureWake({pin: 4, edge: "rising"});
assert.equal(b.r[0x17] & 3, 2);
assert.equal(pm.verifyWake({pin: 4, edge: "rising"}), true);
pm.close();
assert.throws(() => pm.status, /closed/);
console.log("PM1 wake safety mock tests passed");
