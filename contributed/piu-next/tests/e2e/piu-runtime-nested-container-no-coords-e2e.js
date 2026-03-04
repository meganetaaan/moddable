/*---
description: nested container child without coords.
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
			"container",
			{ left: 0, right: 0, top: 0, bottom: 0 },
			node(
				"container",
				{},
				node("label", { string: "Child" }),
			),
		),
	)
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "outer");
}).then($DONE, $DONE);
