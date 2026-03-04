/*---
description: piu-runtime mounts app with onTap behavior.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

let taps = 0;
const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"row",
			{ left: 20, right: 20, top: 20, height: 40, onTap: () => { taps += 1; } },
			node("label", { string: "Tap" })
		)
	)
);

(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.sameValue(taps, 0, "startup should not tap");
	assert.notSameValue(globalThis.application.first, null, "row should exist");
}).then($DONE, $DONE);
