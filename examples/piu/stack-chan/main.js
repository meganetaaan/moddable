/*
 * Stack-chan face renderer (FaceContext-driven)
 * FaceContext + Modifiers -> Behaviors (parts decide when to redraw).
 */

import {} from "piu/MC";
import {} from "piu/shape";
import Timeline from "piu/Timeline";
import { Outline } from "commodetto/outline";
import { createFaceContext, copyFaceContext, defaultFaceContext, toColorString } from "faceContext";
import { createBlinkModifier, createBreathModifier, createSaccadeModifier } from "modifiers";

const mainSkin = new Skin({ fill: "#e7f7ff" });
const backgroundSkin = new Skin({ fill: "#0d1017" });;
const faceSkin = new Skin({ fill: "#131b26" });
// const mouthSkin = new Skin({ fill: "#ff5d5d" });
const irisSkin = mainSkin;
const mouthSkin = mainSkin;
const eyelidSkin = faceSkin;

const BalloonLabel = Label.template($ => ({
	left: $.left,
	top: $.top,
	width: $.width,
	height: $.height,
	string: $.text,
	style: $.style,
	Behavior: BalloonMarqueeBehavior,
}));

class BalloonMarqueeBehavior extends Behavior {
	onCreate(label, data) {
		this.viewportWidth = data.viewportWidth;
		this.padding = data.padding ?? 12;
		this.space = data.space ?? 24;
		this.speed = data.speed ?? 60; // px/sec
		this.timeline = null;
	}

	setup(label, data) {
		const textWidth = label.style.measure(label.string).width;
		const needScroll = textWidth > this.viewportWidth;
		if (!needScroll) {
			if (this.timeline) {
				label.stop();
				this.timeline = null;
			}
			label.duration = 0;
			label.x = this.padding + (this.viewportWidth - textWidth) / 2;
			return;
		}

		const startX = this.padding + this.viewportWidth;
		const endX = this.padding - textWidth - this.space;
		const distance = startX - endX;
		const duration = Math.max(2000, Math.round((distance / this.speed) * 1000));

		const timeline = (this.timeline = new Timeline());
		timeline.on(label, { x: [startX, endX] }, duration, Math.linearEase, 0);
		timeline.seekTo(0);
		label.duration = timeline.duration;
		label.time = 0;
		label.start();
	}

	onDisplaying(label, data) {
		this.setup(label, data);
	}

	onTimeChanged(label) {
		if (this.timeline)
			this.timeline.seekTo(label.time);
	}

	onFinished(label) {
		if (!this.timeline)
			return;
		this.timeline.seekTo(0);
		label.time = 0;
		label.start();
	}
}

const SpeechBalloon = Container.template($ => ({
	left: $.left ?? 16,
	right: $.right ?? 16,
	bottom: $.bottom ?? 12,
	height: $.height ?? 32,
	clip: true,
	Behavior: class extends Behavior {
		onCreate(container, data) {
			this.padding = data.padding ?? 12;
			this.space = data.space ?? 24;
			this.radius = data.radius ?? 6;
			this.text = data.text ?? "Hello from Stack-chan";
			this.font = data.font ?? "20px Open Sans";
			this.speed = data.speed ?? 60;
			this.shape = null;
			this.label = null;
			this.style = new Style({ font: this.font, color: "#000" });
			this.currentPrimary = null;
			this.currentSecondary = null;
		}

		onDisplaying(container) {
			this.ensureParts(container);
			this.updatePalette(defaultFaceContext);
		}

		onFaceContext(container, face) {
			this.ensureParts(container);
			this.updatePalette(face);
		}

		ensureParts(container) {
			if (this.shape)
				return;
			const { padding, space } = this;
			const w = container.width;
			const h = container.height;
			const textSize = this.style.measure(this.text);

			this.shape = new Shape(null, { left: 0, top: 0, width: w, height: h });
			const path = Outline.RoundRectPath(0, 0, w, h, this.radius);
			this.shape.fillOutline = Outline.fill(path);
			this.shape.strokeOutline = Outline.stroke(path, 2);

			this.label = new BalloonLabel(
        {
          viewportWidth: w - padding * 2,
          padding,
          space,
          speed: this.speed,
          left: padding,
          top: (h - textSize.height) / 2,
          width: textSize.width,
          height: textSize.height,
          text: this.text,
          style: this.style,
        },
      );

			container.add(this.shape);
			container.add(this.label);
			// const behavior = this.label.behavior;
			// if (behavior && behavior.onDisplaying)
			// 	behavior.onDisplaying(this.label);
		}

		updatePalette(face) {
			if (!this.shape || !this.label)
				return;
			const primary = toColorString(face.theme.primary);
			const secondary = toColorString(face.theme.secondary);
			if (primary === this.currentPrimary && secondary === this.currentSecondary)
				return;
			this.currentPrimary = primary;
			this.currentSecondary = secondary;
			this.shape.skin = new Skin({ fill: secondary, stroke: primary });
			this.label.style = new Style({ font: this.font, color: primary });
		}
	}
}));

class FaceBehavior extends Behavior {
	onCreate(container) {
		this.current = createFaceContext();
		this.desired = createFaceContext();
		copyFaceContext(defaultFaceContext, this.desired);
		this.modifiers = [
			createBlinkModifier({ openMin: 400, openMax: 5000, closeMin: 200, closeMax: 400 }),
			createBreathModifier({ duration: 6000 }),
			createSaccadeModifier({ updateMin: 300, updateMax: 2000, gain: 0.2 }),
		];
		this.baseY = null; // set after layout
		container.interval = 33;
	}
	onDisplaying(container) {
		if (this.baseY === null)
			this.baseY = container.y; // layout settled
		container.start();
	}
	onTimeChanged(container) {
		const interval = container.interval;
		copyFaceContext(this.desired, this.current);
		const mods = this.modifiers;
		for (let i = 0; i < mods.length; i++) mods[i](interval, this.current);
		if (this.baseY === null)
			this.baseY = container.y;
		container.y = this.baseY + this.current.breath * 8;
		trace(`container.y=${container.y}\n`)
		application.distribute("onFaceContext", this.current);
		// Theme更新を行うならここで skin の色を差し替える
	}
}

const Mouth = Content.template($ => ({
	left: $.cx - 45, top: $.cy - 4, width: 90, height: 8,
	skin: mouthSkin,
	Behavior: class extends Behavior {
		onCreate(content, data) {
			this.cx = data.cx;
			this.cy = data.cy;
			this.minWidth = 50;
			this.maxWidth = 90;
			this.minHeight = 8;
			this.maxHeight = 58;
			this.lastOpen = -1;
			this.updateFromOpen(content, 0);
		}
		onFaceContext(content, face) {
			const open = face.mouth.open;
			if (open === this.lastOpen) return;
			this.updateFromOpen(content, open);
		}
		updateFromOpen(content, open) {
			this.lastOpen = open;
			const h = this.minHeight + (this.maxHeight - this.minHeight) * open;
			const w = this.minWidth + (this.maxWidth - this.minWidth) * (1 - open);
			content.width = w;
			content.height = h;
			content.left = this.cx - w / 2;
			content.top = this.cy - h / 2;
		}
	}
}));

const Iris = Shape.template(({ radius = 8 }) => ({
	left: 0, top: 0, width: radius * 2, height: radius * 2,
	skin: irisSkin,
	Behavior: class extends Behavior {
		onCreate(shape) {
			const path = new Outline.CanvasPath;
			path.arc(radius, radius, radius, 0, 2 * Math.PI);
			path.closePath();
			shape.fillOutline = Outline.fill(path);
		}
	}
}));

const Eye = Container.template($ => ({
	left: $.cx - $.radius - 2,
	top: $.cy - $.radius - 2,
	width: $.radius * 2 + 4,
	height: $.radius * 2 + 4,
	contents: [
		new Iris({ radius: $.radius }),
	],
	Behavior: class extends Behavior {
		onCreate(container, data) {
			this.side = data.side;
			this.iris = container.first;
			this.baseOffset = 2;
			this.lastGazeX = 0;
			this.lastGazeY = 0;
		}
		onFaceContext(container, face) {
			const eye = face.eyes[this.side];
			const gx = eye.gazeX;
			const gy = eye.gazeY;
			if (gx === this.lastGazeX && gy === this.lastGazeY) return;
			this.lastGazeX = gx;
			this.lastGazeY = gy;
			this.iris.left = this.baseOffset + gx * 2;
			this.iris.top = this.baseOffset + gy * 2;
		}
	}
}));

const Eyelid = Content.template($ => ({
	left: $.cx - $.width / 2,
	top: $.cy - $.height / 2,
	width: $.width,
	height: $.height,
	skin: eyelidSkin,
	Behavior: class extends Behavior {
		onCreate(content, data) {
			this.maxHeight = data.height;
			this.side = data.side;
			this.lastOpen = -1;
			content.height = 0;
		}
		onFaceContext(content, face) {
			const eye = face.eyes[this.side];
			const open = eye.open;
			if (open === this.lastOpen) return;
			this.lastOpen = open;
			content.height = this.maxHeight * (1 - open);
		}
	}
}));

const Face = Container.template($ => ({
	left: 0, right: 0, top: 0, height: 240,
	skin: faceSkin,
	Behavior: FaceBehavior,
	contents: [
		new Eye({ cx: 90, cy: 93, radius: 8, side: "left" }),
		new Eye({ cx: 230, cy: 96, radius: 8, side: "right" }),
		new Eyelid({ cx: 90, cy: 93, width: 24, height: 24, side: "left" }),
		new Eyelid({ cx: 230, cy: 96, width: 24, height: 24, side: "right" }),
		new Mouth({ cx: 160, cy: 148 }),
	],
}));

export default new Application(null, {
	skin: backgroundSkin,
	displayListLength: 4096,
	contents: [
		new Face({}),
		new SpeechBalloon({ text: "   Hello from Moddable ! We are excited to your enthusiathm ! " }),
	],
});
