/*---
description: column with minimal row child.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

globalThis.__piuNextDebug = true;
globalThis.__piuNextNoEffect = true;
globalThis.__piuNextSkipChildren = true;
globalThis.__piuNextBypassView = true;

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"column",
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
	assert.notSameValue(globalThis.application.first, null, "column");
}).then($DONE, $DONE);
