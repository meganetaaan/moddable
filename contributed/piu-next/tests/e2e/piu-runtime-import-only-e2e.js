/*---
description: import piu-runtime only.
flags: [async, module]
---*/

import { mountPiuApplication } from "piu-runtime";

Promise.resolve().then(() => {
	assert.notSameValue(mountPiuApplication, undefined, "imported");
}).then($DONE, $DONE);
