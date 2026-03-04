/*---
description: inspect Application.content(0) on empty app.
flags: [async, module]
---*/

import {} from "piu/MC";

const app = new Application(null, {});
(globalThis).application = app;

Promise.resolve().then(() => {
	screen.doIdle();
	const c0 = app.content(0);
	assert.sameValue(c0, undefined, "empty app content(0) should be undefined");
}).then($DONE, $DONE);
