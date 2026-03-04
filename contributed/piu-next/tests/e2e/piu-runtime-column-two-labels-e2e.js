/*---
description: piu-runtime mounts column with two labels.
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
			node("label", { string: "A" }),
			node("label", { string: "B" }),
		)
	)
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	const column = globalThis.application.first;
	assert.notSameValue(column, null, "column");
	assert.sameValue(column.first.string, "A", "first");
	assert.sameValue(column.last.string, "B", "last");
}).then($DONE, $DONE);
