import {} from "piu/MC";
import {} from "piu/multiShape";
import {Outline} from "commodetto/outline";

class BallBehavior extends Behavior {
	onCreate(ball, delta) {
		this.dx = delta;
		this.dy = delta;
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
		super.onCreate(shape, delta);
		const path = new Outline.FreeTypePath;
		path.beginSubpath(50, 90);
		path.lineTo(18, 42);
		path.cubicTo(10, 30, 30, 10, 50, 40);
		path.cubicTo(70, 10, 90, 30, 82, 42);
		path.endSubpath();
		shape.fillOutline = Outline.fill(path);
		shape.strokeOutline = Outline.stroke(path, 5, Outline.LINECAP_BUTT, Outline.LINEJOIN_MITER);
	}
}

let ShapeApplication = Application.template($ => ({
	skin:new Skin({ fill:"black" }),
	contents: [
		MultiShape(1, { left:0, top:0, width:100, height:100, Behavior: Shape1Behavior, skin:new Skin({ fill:rgba(255,0,0,0.75), stroke:rgb(255,0,0) }) } ),
	]
}));

export default new ShapeApplication(null, { displayListLength:4096, touchCount:1, pixels: 240 * 64 });
