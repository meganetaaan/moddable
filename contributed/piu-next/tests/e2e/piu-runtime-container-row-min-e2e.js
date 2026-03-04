/*---
description: container with minimal row child.
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
			{},
			node(
				"row",
				{},
				node("label", { string: "Tap" }),
			),
		),
	)
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "container");
}).then($DONE, $DONE);
