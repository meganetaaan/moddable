/*---
description: piu-runtime mounts minimal app.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node("label", { string: "Hello" })
	)
);

(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.sameValue(globalThis.application.first.string, "Hello", "should render label");
}).then($DONE, $DONE);
