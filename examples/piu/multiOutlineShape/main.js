import {} from "piu/MC";
import {} from "piu/multiShape";
import {Outline} from "commodetto/outline";

class BallBehavior extends Behavior {
	onCreate(ball, delta) {
		this.dx = delta;
		this.dy = delta;
		this.open = 1;
		this.angle = 0;
	}
	onDisplaying(ball) {
		this.x = ball.x;
		this.y = ball.y;
		this.width = ball.container.width - ball.width;
		this.height = ball.container.height - ball.height;
		ball.start();
	}
	onTimeChanged(ball) {
		var dx = this.dx;
		var dy = this.dy;
		ball.moveBy(dx, dy);
		var x = this.x + dx;
		var y = this.y + dy;
		if ((x < 0) || (x > this.width)) dx = -dx;
		if ((y < 0) || (y > this.height)) dy = -dy;
		this.dx = dx;
		this.dy = dy;
		this.x = x;
		this.y = y;
	}
};

class Shape1Behavior extends BallBehavior {
	onCreate(shape, delta) {
		super.onCreate(shape, delta)
		this.open = 1;
		this.angle = 0;
		const path = new Outline.CanvasPath;
		path.rect(0, 50, 100, 50 + 50 * this.open);
		shape.fillOutline = Outline.fill(path)
		shape.strokeOutline = undefined;
	}
	onTimeChanged(ball) {
		super.onTimeChanged(ball)
		this.angle += 5;
		if (this.angle > 360) {
			this.angle = this.angle % 360;
		}
		this.open = Math.sin(Math.PI * 2 * this.angle / 360)
		const path = new Outline.CanvasPath;
		path.rect(0, 50, 100, 50 + 50 * this.open);
		ball.fillOutline = Outline.fill(path)
		ball.strokeOutline = undefined;
		trace(`${this.open}\n`)
	}
}

let ShapeApplication = Application.template($ => ({
	skin:new Skin({ fill:"black" }),
	contents: [
		MultiShape(1, { left:0, top:0, width:100, height:100, Behavior: Shape1Behavior, skin:new Skin({ fill:rgba(255,0,0,0.75), stroke:rgb(255,0,0) }) } ),
	]
}));

export default new ShapeApplication(null, { displayListLength:4096, touchCount:1, pixels: 240 * 64 });
