/*---
description: column with row child only.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

globalThis.__piuNextDebug = true;

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"column",
			{ left: 0, right: 0, top: 0, bottom: 0 },
			node(
				"row",
				{ left: 20, right: 20, top: 10, height: 40 },
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
