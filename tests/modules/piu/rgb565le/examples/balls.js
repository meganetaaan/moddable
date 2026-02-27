/*---
description: Verify examples/piu/balls initial layout.
flags: [onlyStrict, module]
---*/

import Bitmap from "commodetto/Bitmap";
import application from "../../../../../examples/piu/balls/main";

assert.sameValue(Bitmap.RGB565LE, screen.pixelFormat, "requires RGB565LE output");
assert((240 === screen.width) && (320 === screen.height), "unexpected screen");

const balls = [];
for (let ball = application.first; ball; ball = ball.next)
	balls.push(ball);

assert.sameValue(balls.length, 4, "balls example should initialize four ball contents");
assert.sameValue(balls[0].variant, 0, "top-left ball variant mismatch");
assert.sameValue(balls[1].variant, 1, "top-right ball variant mismatch");
assert.sameValue(balls[2].variant, 2, "bottom-right ball variant mismatch");
assert.sameValue(balls[3].variant, 3, "bottom-left ball variant mismatch");

assert.sameValue(balls[0].x, 0, "top-left ball x mismatch");
assert.sameValue(balls[0].y, 0, "top-left ball y mismatch");
assert.sameValue(balls[1].x, screen.width - balls[1].width, "top-right ball x mismatch");
assert.sameValue(balls[1].y, 0, "top-right ball y mismatch");
assert.sameValue(balls[2].x, screen.width - balls[2].width, "bottom-right ball x mismatch");
assert.sameValue(balls[2].y, screen.height - balls[2].height, "bottom-right ball y mismatch");
assert.sameValue(balls[3].x, 0, "bottom-left ball x mismatch");
assert.sameValue(balls[3].y, screen.height - balls[3].height, "bottom-left ball y mismatch");

for (const ball of balls)
	ball.stop();
