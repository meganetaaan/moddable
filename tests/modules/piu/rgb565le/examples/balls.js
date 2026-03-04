/*---
description: Verify examples/piu/spinner initial layout.
flags: [onlyStrict, module]
---*/

import Bitmap from "commodetto/Bitmap";
import spinnerApplication from "../../../../../examples/piu/spinner/main.js";

assert.sameValue(Bitmap.RGB565LE, screen.pixelFormat, "requires RGB565LE output");
assert((240 === screen.width) && (320 === screen.height), "unexpected screen");

const spinner = spinnerApplication.first;
assert.sameValue(typeof spinner, "object", "spinner example should initialize a loading icon");
assert.sameValue(spinner.width, 100, "spinner width mismatch");
assert.sameValue(spinner.height, 100, "spinner height mismatch");
assert.sameValue(spinner.x, 70, "spinner should be centered on x");
assert.sameValue(spinner.y, 110, "spinner should be centered on y");

spinner.stop();
