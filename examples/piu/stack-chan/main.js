/*
 * Stack-chan face renderer (step 3)
 * Face container hosts a Mouth (size-animated) and two Eyes with iris outlines.
 */

import {} from "piu/MC";
import {} from "piu/shape";
import { Outline } from "commodetto/outline";

const backgroundSkin = new Skin({ fill: "#0d1017" });
const faceSkin = new Skin({ fill: "#131b26" });
const mouthSkin = new Skin({ fill: "#ff5d5d" });
const irisSkin = new Skin({ fill: "#e7f7ff" });
const eyelidSkin = backgroundSkin;

const Mouth = Content.template(({ cx = 160, cy = 148 }) => ({
	left: cx - 45, top: cy - 4, width: 90, height: 8,
	skin: mouthSkin,
	Behavior: class extends Behavior {
		onCreate(content) {
			this.cx = cx;
			this.cy = cy;
			this.t = 0;
			this.period = 2400; // ms for one open-close cycle
			this.minWidth = 50;
			this.maxWidth = 90;
			this.minHeight = 8;
			this.maxHeight = 58;
		}
		onDisplaying(content) {
			this.updateMouth(content, 0);
			content.interval = 30;
			content.start();
		}
		onTimeChanged(content) {
			this.t = (this.t + content.interval) % this.period;
			const phase = this.t / this.period;          // 0..1
			const open = 0.15 + 0.65 * (1 - Math.cos(2 * Math.PI * phase)) / 2; // smooth loop
			this.updateMouth(content, open);
		}
		updateMouth(content, open) {
			const h = this.minHeight + (this.maxHeight - this.minHeight) * open;
			const w = this.minWidth + (this.maxWidth - this.minWidth) * (1 - open);
			content.width = w;
			content.height = h;
			content.x = this.cx - w / 2;
			content.y = this.cy - h / 2;
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
			path.closePath(); // close so fillOutline has an area
			shape.fillOutline = Outline.fill(path);
		}
	}
}));

const Eye = Container.template(({ cx = 90, cy = 93, radius = 8 }) => ({
	left: cx - radius,
	top: cy - radius,
	width: radius * 2,
	height: radius * 2,
	contents: [
		new Iris({ radius }),
	],
}));

const Eyelid = Content.template(({ cx = 90, cy = 93, width = 24, height = 24 }) => ({
	left: cx - width / 2,
	top: cy - height / 2,
	width,
	height,
	skin: eyelidSkin,
	Behavior: class extends Behavior {
		onCreate(content) {
			this.maxHeight = height;
			this.state = "open";
			this.elapsed = 0;
			this.wait = this.randomWait();
			content.height = 0; // fully open
			content.interval = 30;
		}
		onDisplaying(content) {
			content.start();
		}
		onTimeChanged(content) {
			this.elapsed += content.interval;
			switch (this.state) {
				case "open":
					if (this.elapsed >= this.wait) {
						this.state = "closing";
						this.elapsed = 0;
					}
					break;
				case "closing": {
					const t = Math.min(1, this.elapsed / 120); // close fast
					content.height = this.maxHeight * t;
					if (t >= 1) {
						this.state = "closed";
						this.elapsed = 0;
					}
					break;
				}
				case "closed":
					content.height = this.maxHeight;
					if (this.elapsed >= 80) {
						this.state = "opening";
						this.elapsed = 0;
					}
					break;
				case "opening": {
					const t = Math.min(1, this.elapsed / 160); // open a bit slower
					content.height = this.maxHeight * (1 - t);
					if (t >= 1) {
						this.state = "open";
						this.elapsed = 0;
						this.wait = this.randomWait();
					}
					break;
				}
			}
		}
		randomWait() {
			return 800 + Math.floor(Math.random() * 3200); // 0.8s to 4s
		}
	}
}));

const Face = Container.template($ => ({
	left: 0, right: 0, top: 0, bottom: 0,
	skin: faceSkin,
	contents: [
		new Eye({ cx: 90, cy: 93, radius: 8 }),
		new Eye({ cx: 230, cy: 96, radius: 8 }),
		new Eyelid({ cx: 90, cy: 93, width: 24, height: 24 }),
		new Eyelid({ cx: 230, cy: 96, width: 24, height: 24 }),
		new Mouth({})
	],
}));

export default new Application(null, {
	skin: backgroundSkin,
	displayListLength: 4096,
	contents: [
		new Face({})
	],
});
