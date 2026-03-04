/*---
description: column with nested container child.
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
			node(
				"container",
				{ left: 20, right: 20, top: 10, height: 40 },
				node("label", { string: "Child" }),
			),
		),
	)
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "column");
}).then($DONE, $DONE);
