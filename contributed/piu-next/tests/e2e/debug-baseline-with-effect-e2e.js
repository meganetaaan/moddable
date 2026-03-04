/*---
description: baseline Piu with signal effect.
flags: [async, module]
---*/

import {} from "piu/MC";
import { effect } from "signal";

effect(() => {
	1;
});

const app = new Application(null, {
	contents: [
		new Column(null, {
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			contents: [
				new Label(null, { string: "Top" }),
				new Row(null, { left: 20, right: 20, top: 10, height: 40, contents: [new Label(null, { string: "Tap" })] }),
			],
		}),
	],
});
(globalThis).application = app;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "column");
}).then($DONE, $DONE);
