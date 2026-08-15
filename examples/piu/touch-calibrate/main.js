/*
 * Copyright (c) 2026  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *
 */

import {} from "piu/MC";
const backgroundSkin = new Skin({fill: "#101820"});
const titleStyle = new Style({font: "24px Open Sans", color: "white", horizontal: "center"});
const statusStyle = new Style({font: "20px Open Sans", color: "white", horizontal: "center"});
const BACKGROUND = 0x101820FF;
const TARGET = 0x00D8FFFF;
const TOUCHED = 0xFF4050FF;
const COMPLETE = 0x40E080FF;
function drawCross(port, point, color, radius = 20) {
	port.fillColor(color, point.x - radius, point.y - 1, (radius * 2) + 1, 3);
	port.fillColor(color, point.x - 1, point.y - radius, 3, (radius * 2) + 1);
}

class CalibrationBehavior extends Behavior {
	onCreate(port, data) {
		this.data = data;
		this.reset();
	}
	onDisplaying(port) {
		const margin = Math.max(32, Math.min(80, Math.round(Math.min(port.width, port.height) / 10)));
		this.targets = [
			{x: margin, y: margin},
			{x: port.width - margin - 1, y: margin},
			{x: port.width - margin - 1, y: port.height - margin - 1},
			{x: margin, y: port.height - margin - 1},
			{x: Math.round((port.width - 1) / 2), y: Math.round((port.height - 1) / 2)},
		];
		this.updateLabels();
	}
	onDraw(port, x, y, width, height) {
		port.fillColor(BACKGROUND, x, y, width, height);
		for (let i = 0; i < this.samples.length; i++) {
			drawCross(port, this.targets[i], COMPLETE, 14);
			drawCross(port, this.samples[i], TOUCHED, 8);
		}
		if (this.index < this.targets?.length)
			drawCross(port, this.targets[this.index], TARGET);
		if (this.touch)
			drawCross(port, this.touch, TOUCHED, 10);
	}
	onTouchBegan(port, id, x, y) {
		if (undefined !== this.id)
			return;
		if (this.index >= this.targets.length) {
			this.reset();
			this.updateLabels();
			port.invalidate();
			return;
		}
		this.id = id;
		this.touch = {x, y};
		this.updateStatus(x, y);
		port.invalidate();
	}
	onTouchEnded(port, id) {
		if (id !== this.id)
			return;
		this.samples.push(this.touch);
		this.touch = undefined;
		this.id = undefined;
		this.index++;
		if (this.index === this.targets.length)
			this.finish();
		else
			this.updateLabels();
		port.invalidate();
	}
	reset() {
		this.id = undefined;
		this.index = 0;
		this.samples = [];
		this.touch = undefined;
	}
	updateLabels() {
		this.data.title.string = `Touch calibration ${this.index + 1}/${this.targets.length}`;
		this.data.status.string = "Tap the target crosshair";
	}
	updateStatus(x, y) {
		const target = this.targets[this.index];
		this.data.status.string = `target ${target.x},${target.y}  touch ${x},${y}  delta ${x - target.x},${y - target.y}`;
	}
	finish() {
		const s = this.samples;
		const t = this.targets;
		const horizontal = {
			x: ((s[1].x - s[0].x) + (s[2].x - s[3].x)) / 2,
			y: ((s[1].y - s[0].y) + (s[2].y - s[3].y)) / 2,
		};
		const vertical = {
			x: ((s[3].x - s[0].x) + (s[2].x - s[1].x)) / 2,
			y: ((s[3].y - s[0].y) + (s[2].y - s[1].y)) / 2,
		};
		const xAxis = Math.abs(horizontal.x) >= Math.abs(horizontal.y) ? "x" : "y";
		const yAxis = Math.abs(vertical.x) >= Math.abs(vertical.y) ? "x" : "y";
		const left = (s[0][xAxis] + s[3][xAxis]) / 2;
		const right = (s[1][xAxis] + s[2][xAxis]) / 2;
		const top = (s[0][yAxis] + s[1][yAxis]) / 2;
		const bottom = (s[3][yAxis] + s[2][yAxis]) / 2;
		if ((xAxis === yAxis) || (Math.abs(right - left) < 2) || (Math.abs(bottom - top) < 2)) {
			this.data.title.string = "Calibration failed - tap to retry";
			this.data.status.string = "Could not determine independent X/Y axes";
			return;
		}
		const scaleX = (t[1].x - t[0].x) / (right - left);
		const scaleY = (t[3].y - t[0].y) / (bottom - top);
		const offsetX = t[0].x - (left * scaleX);
		const offsetY = t[0].y - (top * scaleY);
		const centerX = (s[4][xAxis] * scaleX) + offsetX;
		const centerY = (s[4][yAxis] * scaleY) + offsetY;
		const error = Math.round(Math.hypot(centerX - t[4].x, centerY - t[4].y));
		this.data.title.string = "Calibration result - tap to repeat";
		this.data.status.string = `x'=${scaleX.toFixed(5)}*${xAxis}${offsetX < 0 ? "" : "+"}${offsetX.toFixed(1)}  y'=${scaleY.toFixed(5)}*${yAxis}${offsetY < 0 ? "" : "+"}${offsetY.toFixed(1)}  center error=${error}px`;
		trace("Touch calibration (event coordinates -> screen coordinates)\n");
		trace("const x = point.x, y = point.y;\n");
		trace(`point.x = Math.round((${scaleX.toFixed(8)} * ${xAxis}) + ${offsetX.toFixed(4)});\n`);
		trace(`point.y = Math.round((${scaleY.toFixed(8)} * ${yAxis}) + ${offsetY.toFixed(4)});\n`);
	}
}

const CalibrationApplication = Application.template($ => ({
	skin: backgroundSkin,
	contents: [
		Port($, {left: 0, right: 0, top: 0, bottom: 0, active: true, Behavior: CalibrationBehavior}),
		Label($, {anchor: "title", left: 0, right: 0, top: 8, height: 34, style: titleStyle}),
		Label($, {anchor: "status", left: 0, right: 0, bottom: 8, height: 30, style: statusStyle}),
	],
}));

const data = {};
export default new CalibrationApplication(data, {
	displayListLength: 4096,
	touchCount: 1,
});
