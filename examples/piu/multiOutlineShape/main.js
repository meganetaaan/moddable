import {} from "piu/MC";
import {} from "piu/multiShape";
import {} from "piu/shape";
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
		trace(ball.x)
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

class LeftMultiBehavior extends BallBehavior {
    onCreate(ms, delta) {
        super.onCreate(ms, delta);
        this.angle = 0;
        ms.interval = 16;
        ms.start();
        this.updateItems(ms);
    }
    updateItems(ms) {
        const open = 0.5 + 0.5 * Math.sin(Math.PI * 2 * this.angle / 360);
        // item0: fill rect that grows/shrinks vertically
        const p0 = new Outline.CanvasPath;
				trace(`${open}\n`)
        p0.rect(0, 0, 100, 50 + 50 * open);
        // item1: stroke rect inset that grows/shrinks horizontally
        const p1 = new Outline.CanvasPath;
        p1.rect(10, 10, 90 + 0 * open, 90);
        ms.items = [
            { fill: Outline.fill(p0), skin: new Skin({ fill: rgba(0,255,255 * open,0.75) }) },
            { stroke: Outline.stroke(p1, 5, Outline.LINECAP_BUTT, Outline.LINEJOIN_MITER), skin: new Skin({ stroke: rgb(255,255,255) }) },
        ];
    }
    onTimeChanged(ms) {
        super.onTimeChanged(ms);
        this.angle = (this.angle + 5) % 360;
        this.updateItems(ms);
    }
}

class RightContainerBehavior extends BallBehavior {
    onCreate(container, delta) {
        super.onCreate(container, delta);
        this.angle = 0;
        this.updateChildren(container);
        container.interval = 16;
        container.start();
    }
    updateChildren(container) {
        const open = 0.5 + 0.5 * Math.sin(Math.PI * 2 * this.angle / 360);
        const p0 = new Outline.CanvasPath;
        p0.rect(0, 0, 100, 50 + 50 * open);
        const p1 = new Outline.CanvasPath;
        p1.rect(10, 10, 90 + 0 * open, 90);
				const s0 = container.content(0);
				const s1 = container.content(1);
        s0.fillOutline = Outline.fill(p0);
        s0.strokeOutline = undefined;
        s1.fillOutline = undefined;
        s1.strokeOutline = Outline.stroke(p1, 5, Outline.LINECAP_BUTT, Outline.LINEJOIN_MITER);
    }
    onTimeChanged(container) {
				// trace('onTimeChanged\n')
        super.onTimeChanged(container);
        this.angle = (this.angle + 5) % 360;
        this.updateChildren(container);
    }
}

let ShapeApplication = Application.template(($) => ({
  skin: new Skin({ fill: "black" }),
  contents: [
    // Left: MultiShape using items
    MultiShape(1, {
      left: 10,
      top: 10,
      width: 100,
      height: 100,
      Behavior: LeftMultiBehavior,
      skin: new Skin({
        fill: rgba(255, 255, 255, 1),
        stroke: rgb(255, 255, 255),
      }),
    }),
    // Right: Container with two Shape children drawing in the same order
    Container(1, {
      left: 130,
      top: 10,
      width: 100,
      height: 100,
      clip: true,
      Behavior: RightContainerBehavior,
      contents: [
        Shape(1, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          skin: new Skin({ fill: rgba(255, 0, 0, 0.75) }),
        }),
        Shape(1, {
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          skin: new Skin({ stroke: rgb(255, 0, 0) }),
        }),
      ],
    }),
  ],
}));

export default new ShapeApplication(null, { displayListLength:4096, touchCount:1, pixels: 240 * 64 });
