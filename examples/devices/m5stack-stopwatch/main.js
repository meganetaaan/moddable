/*
 * Copyright (c) 2016-2017  Moddable Tech, Inc.
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


import Poco from "commodetto/Poco";
import Timer from "timer";
trace("STOPWATCH boot\n");
const render = new Poco(screen);
render.begin(); render.fillRectangle(render.makeColor(0, 30, 60), 0, 0, render.width, render.height); render.fillRectangle(render.makeColor(240, 120, 0), 150, 150, 166, 166); render.end();
trace(`DISPLAY ${render.width}x${render.height}\n`);
let touch; try { touch = new device.sensor.Touch(); } catch(e) {trace(`TOUCH ERROR ${e}\n`);}
trace("TOUCH constructed\n");
let toneActive = false;
let micActive = true;
let colorToggle = false;
function tone() {
	if (toneActive || micActive) return;
	toneActive = true;
	let phase = 0, writes = 0;
	const wave = new Int16Array(400);
	for (let n = 0; n < wave.length; n++) wave[n] = Math.sin(n * 2 * Math.PI * 11 / 400) * 32767;
	trace("SPEAKER creating\n");
	const output = new device.audio.Output({onWritable(size) {
		const samples = new Int16Array(size >> 1);
		for (let i = 0; i < samples.length;) {
			const offset = phase % wave.length, count = Math.min(samples.length - i, wave.length - offset);
			samples.set(wave.subarray(offset, offset + count), i);
			i += count; phase += count;
		}
		this.write(samples.buffer); writes++;
	}});
	trace("SPEAKER starting\n");
	output.volume = 0.5;
	output.start();
	trace("SPEAKER started\n");

	Timer.set(() => {output.stop(); output.close(); toneActive = false; trace(`SPEAKER writes=${writes}\n`);}, 3000);
}
const buttons = [new device.peripheral.button.A({onPush(){
	trace(`BUTTON A ${this.pressed}\n`);
	if (this.pressed) tone();
}}), new device.peripheral.button.B({onPush(){
	trace(`BUTTON B ${this.pressed}\n`);
	if (!this.pressed) return;
	colorToggle = !colorToggle;
	render.begin(); render.fillRectangle(render.makeColor(colorToggle ? 0 : 30, colorToggle ? 160 : 60, 120), 0, 0, render.width, render.height); render.end();
}})];
Timer.repeat(() => {
	const points = touch?.sample();
	if (!points?.length) return;
	trace(`TOUCH ${JSON.stringify(points)}\n`);
	for (const point of points) {
		const x = Math.min(454, Math.max(0, point.x - 6)), y = Math.min(454, Math.max(0, point.y - 6));
		render.begin(x, y, 12, 12);
		render.fillRectangle(render.makeColor(250, 200, 0), x, y, 12, 12);
		render.end();
	}
}, 50);
Timer.repeat(() => trace("STOPWATCH alive\n"), 5000);

try {
	const rtc = new device.rtc.io({...device.rtc, clock: {...device.rtc.clock, io: device.io.SMBus}});
	trace(`RTC ${rtc.time}\n`); rtc.close();
} catch(e) {trace(`RTC ERROR ${e}\n`);}
try {
	const imu = new device.sensor.IMU(); imu.configure({accelerometer: {range: 1}, gyroscope: {range: 2}});
	Timer.delay(100); trace(`IMU ${JSON.stringify(imu.sample())}\n`); imu.close();
} catch(e) {trace(`IMU ERROR ${e}\n`);}
let frames = 0, peak = 0;
const input = new device.audio.Input({onReadable(size) {
	const samples = new Int16Array(this.read(size));
	for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
	frames++;
}});
input.start();
Timer.set(() => {input.stop(); input.close(); micActive = false; trace(`MIC frames=${frames} peak=${peak}\n`);}, 5000);

trace("Press A for a 3-second tone after microphone test finishes.\n");
