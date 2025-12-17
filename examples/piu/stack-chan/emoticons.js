import {} from "piu/shape";
import { Outline } from "commodetto/outline";
import { defaultFaceContext, toColorString } from "faceContext";

// Heart outline with a gentle pulse/tilt animation.
export const Heart = Shape.template($ => ({
	left: $.left,
	right: $.right,
	top: $.top,
	bottom: $.bottom,
	width: $.width ?? 40,
	height: $.height ?? 40,
	Behavior: class extends Behavior {
		onCreate(shape, data = {}) {
			this.angle = data.angle ?? 0.1;
			this.xScale = (data.width ?? shape.width) / 40;
			this.yScale = (data.height ?? shape.height) / 40;
			this.fraction = 0;
			this.primary = null;
			this.baseOutline = this.buildBaseOutline();
			shape.interval = data.interval ?? 33;
			this.updateSkin(shape, defaultFaceContext);
		}
		onDisplaying(shape) {
			this.applyOutline(shape);
			shape.start();
		}
		onUndisplaying(shape) {
			shape.stop();
		}
		onTimeChanged(shape) {
			this.fraction += (2 * Math.PI) / 100;
			this.applyOutline(shape);
		}
		onFaceContext(shape, face) {
			this.updateSkin(shape, face);
		}
		buildBaseOutline() {
			const path = new Outline.CanvasPath;
			path.moveTo(20, 13);
			path.bezierCurveTo(18, 8, 14, 5, 10, 5);
			path.bezierCurveTo(8, 5, 0, 5, 0, 15);
			path.bezierCurveTo(0, 30, 18, 35, 20, 40);
			path.bezierCurveTo(22, 35, 40, 30, 40, 15);
			path.bezierCurveTo(40, 5, 32, 5, 30, 5);
			path.bezierCurveTo(26, 5, 22, 8, 20, 13);
			return Outline.fill(path);
		}
		applyOutline(shape) {
			const scale = Math.abs(Math.sin(this.fraction)) / 4 + 0.75;
			shape.fillOutline = this.baseOutline
				.clone()
				.scale(scale * this.xScale, scale * this.yScale)
				.rotate(this.angle);
		}
		updateSkin(shape, face) {
			const theme = face && face.theme ? face.theme : defaultFaceContext.theme;
			const color = toColorString(theme.primary || defaultFaceContext.theme.primary);
			if (color === this.primary)
				return;
			this.primary = color;
			shape.skin = new Skin({ fill: color, stroke: color });
		}
	}
}));

// “むかむか” style angry symbol (crossed veins)
export const Angry = Shape.template($ => ({
	left: $.left,
	right: $.right,
	top: $.top,
	bottom: $.bottom,
	width: $.width ?? 40,
	height: $.height ?? 40,
	Behavior: class extends Behavior {
		onCreate(shape, data = {}) {
			this.angle = data.angle ?? 0.1;
			this.xScale = (data.width ?? shape.width) / 40;
			this.yScale = (data.height ?? shape.height) / 40;
			this.fraction = 0;
			this.primary = null;
			this.baseOutline = this.buildBaseOutline();
			shape.interval = data.interval ?? 33;
			this.updateSkin(shape, defaultFaceContext);
		}
		onDisplaying(shape) {
			this.applyOutline(shape);
			shape.start();
		}
		onUndisplaying(shape) {
			shape.stop();
		}
		onTimeChanged(shape) {
			this.fraction += (2 * Math.PI) / 100;
			this.applyOutline(shape);
		}
		onFaceContext(shape, face) {
			this.updateSkin(shape, face);
		}
		buildBaseOutline() {
			const path = new Outline.CanvasPath;
			path.moveTo(15, 5);
			path.quadraticCurveTo(20, 20, 5, 15);
			path.moveTo(25, 5);
			path.quadraticCurveTo(20, 20, 35, 15);
			path.moveTo(5, 25);
			path.quadraticCurveTo(20, 20, 15, 35);
			path.moveTo(25, 35);
			path.quadraticCurveTo(20, 20, 35, 25);
			return Outline.stroke(path, 2);
		}
		applyOutline(shape) {
			const scale = Math.abs(Math.sin(this.fraction)) / 4 + 0.75;
			shape.strokeOutline = this.baseOutline
				.clone()
				.scale(scale * this.xScale, scale * this.yScale)
				.rotate(this.angle);
		}
		updateSkin(shape, face) {
			const theme = face && face.theme ? face.theme : defaultFaceContext.theme;
			const color = toColorString(theme.primary || defaultFaceContext.theme.primary);
			if (color === this.primary)
				return;
			this.primary = color;
			shape.skin = new Skin({ fill: color, stroke: color });
		}
	}
}));

// Sweat drops: multiple, intermittent, drift straight down with grow-then-hold scale.
export const Sweat = Container.template($ => ({
	left: $.left,
	right: $.right,
	top: $.top,
	bottom: $.bottom,
	width: $.width ?? 64,   // wider and taller to avoid clipping
	height: $.height ?? 120,
	Behavior: class extends Behavior {
		onCreate(container, data = {}) {
			this.width = data.width ?? container.width;
			this.height = data.height ?? container.height;
			this.count = data.count ?? 3;
			this.interval = data.interval ?? 33;
			this.smallScale = 0.21; // start small
			this.holdScale = 0.36;   // mid-late size
			this.basePath = this.buildBasePath();
			this.drops = [];
			this.primary = null;
			this.secondary = null;
			for (let i = 0; i < this.count; i++) {
				const shape = new Shape(null, { left: 0, top: 0, width: this.width, height: this.height });
				container.add(shape);
				this.drops.push(this.spawnDrop(shape, true));
			}
			container.interval = this.interval;
		}
		onDisplaying(container) {
			this.tick(container, 0);
			container.start();
		}
		onUndisplaying(container) {
			container.stop();
		}
		onTimeChanged(container) {
			this.tick(container, container.interval);
		}
		onFaceContext(_container, face) {
			const theme = face && face.theme ? face.theme : defaultFaceContext.theme;
			const primary = toColorString(theme.primary || defaultFaceContext.theme.primary);
			const secondary = toColorString(theme.secondary || defaultFaceContext.theme.secondary);
			this.primary = primary;
			this.secondary = secondary;
		}
		tick(container, dt) {
			const primary = this.primary ?? "#fff";
			const secondary = this.secondary ?? "#000";
			for (const drop of this.drops) {
				drop.life += dt;
				const t = drop.life / drop.maxLife;
				// size: ramp up, hold, then shrink at the end
				let scale = t < 0.3
					? this.smallScale + (this.holdScale - this.smallScale) * (t / 0.3)
					: this.holdScale;
				if (t > 0.85) {
					const k = 1 - (t - 0.85) / 0.15;
					scale *= Math.max(0, k);
				}
				drop.y += drop.speed * (dt / 16.67); // scale by nominal frame
				if (drop.y > this.height + 16) {
					this.respawn(drop);
					continue;
				}
				const filled = Outline.fill(this.basePath)
					.scale(scale, scale)
					.translate(drop.x, drop.y);
				const stroked = Outline.stroke(this.basePath, 2)
					.scale(scale, scale)
					.translate(drop.x, drop.y);
				drop.shape.fillOutline = filled;
				drop.shape.strokeOutline = stroked;
				drop.shape.skin = new Skin({ fill: secondary, stroke: primary });
			}
		}
		buildBasePath() {
			// Teardrop path centered near origin for easier translate
			const path = new Outline.CanvasPath;
			path.moveTo(0, -20);
			path.quadraticCurveTo(-6, -6, -10, 6);
			path.quadraticCurveTo(-12, 12, -12, 18);
			path.quadraticCurveTo(-12, 30, 0, 36);
			path.quadraticCurveTo(12, 30, 12, 18);
			path.quadraticCurveTo(12, 12, 10, 6);
			path.quadraticCurveTo(6, -6, 0, -20);
			path.closePath();
			return path;
		}
		spawnDrop(shape, initial = false) {
			const maxLife = 1700 + Math.random() * 1100;
			const startOffset = initial ? Math.random() * maxLife : 0;
			const drop = {
				x: 6 + Math.random() * (this.width - 12),
				y: -20 - Math.random() * 20,
				speed: 0.55 + Math.random() * 0.45, // slower fall
				life: startOffset,
				maxLife,
				shape,
			};
			return drop;
		}
		respawn(drop) {
			const maxLife = 1700 + Math.random() * 1100;
			drop.x = 6 + Math.random() * (this.width - 12);
			drop.y = -20 - Math.random() * 20;
			drop.speed = 0.55 + Math.random() * 0.45;
			drop.life = 0;
			drop.maxLife = maxLife;
		}
	}
}));

// Tears falling under the eyes (shorter fall, two lanes by default)
export const Tear = Container.template($ => ({
	left: $.left,
	right: $.right,
	top: $.top,
	bottom: $.bottom,
	width: $.width ?? 320,
	height: $.height ?? 120,
	Behavior: class extends Behavior {
		onCreate(container, data = {}) {
			this.width = data.width ?? container.width;
			this.height = data.height ?? container.height;
			this.lanes = Array.isArray(data.lanes) ? data.lanes : null; // [[min,max], ...]
			this.count = data.count ?? (this.lanes ? this.lanes.length : 4); // default: a pair per eye
			this.interval = data.interval ?? 33;
			this.smallScale = 0.18;
			this.holdScale = 0.28;
			this.basePath = this.buildBasePath();
			this.drops = [];
			this.primary = null;
			this.secondary = null;
			// preset lanes: spaced evenly
			for (let i = 0; i < this.count; i++) {
				const shape = new Shape(null, { left: 0, top: 0, width: this.width, height: this.height });
				container.add(shape);
				this.drops.push(this.spawnDrop(shape, i, true));
			}
			container.interval = this.interval;
		}
		onDisplaying(container) {
			this.tick(container, 0);
			container.start();
		}
		onUndisplaying(container) {
			container.stop();
		}
		onTimeChanged(container) {
			this.tick(container, container.interval);
		}
		onFaceContext(_container, face) {
			const theme = face && face.theme ? face.theme : defaultFaceContext.theme;
			const primary = toColorString(theme.primary || defaultFaceContext.theme.primary);
			const secondary = toColorString(theme.secondary || defaultFaceContext.theme.secondary);
			this.primary = primary;
			this.secondary = secondary;
		}
		tick(_container, dt) {
			const primary = this.primary ?? "#fff";
			const secondary = this.secondary ?? "#000";
			for (const drop of this.drops) {
				drop.life += dt;
				const t = drop.life / drop.maxLife;
				let scale = t < 0.25
					? this.smallScale + (this.holdScale - this.smallScale) * (t / 0.25)
					: this.holdScale;
				if (t > 0.75) {
					const k = 1 - (t - 0.75) / 0.25;
					scale *= Math.max(0, k);
				}
				drop.y += drop.speed * (dt / 16.67);
				if (drop.y > this.height + 8) {
					this.respawn(drop);
					continue;
				}
				const filled = Outline.fill(this.basePath)
					.scale(scale, scale)
					.translate(drop.x, drop.y);
				const stroked = Outline.stroke(this.basePath, 2)
					.scale(scale, scale)
					.translate(drop.x, drop.y);
				drop.shape.fillOutline = filled;
				drop.shape.strokeOutline = stroked;
				drop.shape.skin = new Skin({ fill: secondary, stroke: primary });
			}
		}
		buildBasePath() {
			const path = new Outline.CanvasPath;
			path.moveTo(0, -12);
			path.quadraticCurveTo(-4, -2, -7, 5);
			path.quadraticCurveTo(-8, 10, -8, 14);
			path.quadraticCurveTo(-8, 22, 0, 26);
			path.quadraticCurveTo(8, 22, 8, 14);
			path.quadraticCurveTo(8, 10, 7, 5);
			path.quadraticCurveTo(4, -2, 0, -12);
			path.closePath();
			return path;
		}
		spawnDrop(shape, laneIndex = 0, initial = false) {
			const lanes = this.count;
			const laneWidth = this.width / lanes;
			let min = laneWidth * laneIndex;
			let max = laneWidth * (laneIndex + 1);
			if (this.lanes && this.lanes.length > 0) {
				const pair = this.lanes[laneIndex % this.lanes.length];
				if (Array.isArray(pair) && pair.length === 2) {
					min = pair[0];
					max = pair[1];
				}
			}
			const center = (min + max) / 2;
			const jitter = (max - min) * 0.18;
			const maxLife = 900 + Math.random() * 400;
			const startOffset = initial ? Math.random() * maxLife : 0;
			return {
				x: center + (Math.random() - 0.5) * jitter,
				y: -10 - Math.random() * 8,
				speed: 0.45 + Math.random() * 0.25,
				life: startOffset,
				maxLife,
				shape,
			};
		}
		respawn(drop) {
			const maxLife = 900 + Math.random() * 400;
			const lanes = this.count;
			const laneIndex = Math.floor(Math.random() * lanes);
			const laneWidth = this.width / lanes;
			let min = laneWidth * laneIndex;
			let max = laneWidth * (laneIndex + 1);
			if (this.lanes && this.lanes.length > 0) {
				const pair = this.lanes[laneIndex % this.lanes.length];
				if (Array.isArray(pair) && pair.length === 2) {
					min = pair[0];
					max = pair[1];
				}
			}
			const center = (min + max) / 2;
			const jitter = (max - min) * 0.18;
			drop.x = center + (Math.random() - 0.5) * jitter;
			drop.y = -10 - Math.random() * 8;
			drop.speed = 0.45 + Math.random() * 0.25;
			drop.life = 0;
			drop.maxLife = maxLife;
		}
	}
}));

// Sleepy bubbles rising near the head.
export const SleepyBubble = Container.template($ => ({
	left: $.left,
	right: $.right,
	top: $.top,
	bottom: $.bottom,
	width: $.width ?? 48,
	height: $.height ?? 64,
	Behavior: class extends Behavior {
		onCreate(container, data = {}) {
			this.width = data.width ?? container.width;
			this.height = data.height ?? container.height;
			this.bubbles = [];
			this.theme = defaultFaceContext.theme;
			this.primary = null;
			this.secondary = null;
			for (let i = 0; i < 4; i++) {
				const shape = new Shape(null, { left: 0, top: 0, width: this.width, height: this.height });
				this.bubbles.push({
					x: Math.random() * this.width,
					vx: 0,
					y: Math.random() * this.height,
					r: 4 + Math.random() * 3,
					shape,
				});
				container.add(shape);
			}
			container.interval = data.interval ?? 33;
		}
		onTimeChanged(container) {
			this.tick(container.interval);
		}
		onDisplaying(container) {
			this.tick(0);
			container.start();
		}
		onUndisplaying(container) {
			container.stop();
		}
		onFaceContext(container, face) {
			this.updateSkin(face);
		}
		tick(_dt) {
			this.updateSkin();
			const width = this.width;
			const height = this.height;
			for (const b of this.bubbles) {
				const path = new Outline.CanvasPath;
				const upwardSpeed = 1 - b.r / 12;
				b.vx = b.vx * 0.85 + 0.1 * (Math.random() - 0.5);
				b.x += b.vx;
				b.x = Math.max(b.r, Math.min(width - b.r, b.x));
				b.y = b.y + upwardSpeed * 2;
				if (b.y > height - b.r) {
					b.y = b.r;
					b.x = width * (1 - Math.random() * 0.2);
					b.vx = -3;
				}
				b.r = Math.max(3, Math.min(12, b.r + 0.2 * (Math.random() - 0.5)));
				path.arc(b.x, height - b.y, b.r, 0, 2 * Math.PI);
				b.shape.strokeOutline = Outline.stroke(path, 2);
				b.shape.skin = new Skin({ fill: this.secondary ?? "#000", stroke: this.primary ?? "#fff" });
			}
		}
		updateSkin(face) {
			if (face && face.theme)
				this.theme = face.theme;
			const theme = this.theme || defaultFaceContext.theme;
			const primary = toColorString(theme.primary || defaultFaceContext.theme.primary);
			const secondary = toColorString(theme.secondary || defaultFaceContext.theme.secondary);
			if (primary === this.primary && secondary === this.secondary)
				return;
			this.primary = primary;
			this.secondary = secondary;
		}
	}
}));

export function createEmoticon(key, opts = {}) {
	switch (key) {
		case "heart":
			return new Heart({ left: 12, top: 12, width: 40, height: 40, angle: 0.16, ...opts });
		case "angry":
			return new Angry({ left: 12, top: 12, width: 40, height: 40, angle: 0.12, ...opts });
		case "sweat":
			// 縦長エリアで落下を見切れさせない
			return new Sweat({ left: 8, top: 10, width: 72, height: 140, ...opts });
		case "tear":
			// 涙: 目の下全体をカバーしつつ高さを確保
			return new Tear({
				left: 0,
				right: 0,
				top: 96,
				height: 120,
				lanes: [
					[80, 100],  // left eye vicinity (cx ≈ 90)
					[220, 240], // right eye vicinity (cx ≈ 230)
				],
				count: 4,
				...opts
			});
		case "sleepy":
			return new SleepyBubble({ left: 16, top: 8, width: 48, height: 64, ...opts });
		default:
			return new Heart({ left: 12, top: 12, width: 40, height: 40, angle: 0.16, ...opts });
	}
}
