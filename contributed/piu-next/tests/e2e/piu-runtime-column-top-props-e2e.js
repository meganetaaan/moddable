/*---
description: column with top properties on children.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"column",
			{ left: 0, right: 0, top: 0, bottom: 0 },
			node("label", { top: 10, height: 20, string: "A" }),
			node("label", { top: 10, height: 20, string: "B" }),
		),
	)
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "column");
}).then($DONE, $DONE);
