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
const source = await readFile(new URL("./cst820.js", import.meta.url), "utf8");
const {default: Touch} = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
class Bus {
	static current;
	bytes = new Uint8Array(7);
	constructor(options) { Bus.current = this; this.options = options; }
	readBuffer(r, b) { assert.equal(r, 0); b.set(this.bytes); }
	close() { this.closed = true; }
}
const touch = new Touch({sensor: {io: Bus}});
const bus = Bus.current;
assert.equal(bus.options.address, 0x15);
assert.deepEqual(touch.sample(), []);
bus.bytes.set([0,0,1,0,100,0,233]);
assert.deepEqual(touch.sample(), [{x: 100, y: 233, id: 0}]);
bus.bytes[3] = 0x40;
assert.deepEqual(touch.sample(), []);
bus.bytes[3] = 0x80;
assert.deepEqual(touch.sample(), [{x: 100, y: 233, id: 0}]);
touch.configure({active:false});
assert.equal(touch.sample(), undefined);
touch.configure({active:true});
assert.equal(touch.sample().length, 1);
touch.close(); touch.close();
assert.equal(bus.closed, true);
console.log("CST820 mock tests passed");
