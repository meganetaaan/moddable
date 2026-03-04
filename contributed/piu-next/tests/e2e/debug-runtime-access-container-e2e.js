/*---
description: access container links on runtime tree.
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
			{ left: 20, right: 20, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 0, height: 40 }, "Count: 0"),
			node("row", { left: 0, right: 0, top: 10, height: 40, active: true }, node("label", {}, "Tap")),
		),
	)
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	const app = globalThis.application;
	const panel = app.first;
	assert.notSameValue(panel, null, "panel exists");
	const parent = panel.container;
	assert.sameValue(parent, app, "panel parent is app");
}).then($DONE, $DONE);
