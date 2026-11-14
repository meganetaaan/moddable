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
let source = (await readFile(new URL("./provider.js", import.meta.url), "utf8")).replace(/^import .*;$/gm, "");
source = (await readFile(new URL("./audio-provider.js", import.meta.url), "utf8")).replace(/^import .*;$/gm, "").replace("export default function", "function") + "\n" + source;
let stopped = 0, closed = 0, failAmp = false;
globalThis.ioExpander = {write(pin) { if (pin === 10 && failAmp) throw new Error("expander unavailable"); }};
globalThis.__audioTest = {
	Timer: {delay() {}},
	Codec: class { configure() {} start() {} stop() {} close() {} },
	Audio: class { start() {} stop() { stopped++; } close() { closed++; } }
};
globalThis.__audioTest.Audio.Async = class extends globalThis.__audioTest.Audio {};
const prelude = "const {Timer, Codec, Audio: AudioInput, Audio: AudioOutput} = globalThis.__audioTest; const CST820 = class {}, CST9217 = class {}, BMI270 = class {}, Button = class {}, RTC = class {};";
const {default: device} = await import("data:text/javascript;base64," + Buffer.from(prelude + source).toString("base64"));
device.io = {SMBus: class {}, Digital: class {static Output = 1; write() {} close() {}}};
let audio = new device.audio.Output({});
const input = new device.audio.Input({});
assert.throws(() => new device.audio.Input({}), /already in use/);
input.close();
closed = 0;
audio.start();
audio.stop();
assert.equal(stopped, 1);
audio.close(); audio.close();
assert.equal(closed, 1);
audio = new device.audio.Output({});
failAmp = true;
assert.throws(() => audio.stop(), /expander unavailable/);
assert.equal(stopped, 2, "I2S must stop even when amplifier I2C fails");
failAmp = false;
audio.close();
delete globalThis.__audioTest;
delete globalThis.ioExpander;
console.log("StopWatch audio lifecycle mock tests passed");
