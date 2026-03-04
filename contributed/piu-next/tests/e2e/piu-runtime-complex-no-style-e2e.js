/*---
description: piu-runtime mounts complex tree without styles.
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
			{ left: 24, right: 24, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 18, height: 40 }, "piu-next"),
			node("label", { left: 0, right: 0, top: 4, height: 52 }, "Count: 0"),
			node(
				"row",
				{ left: 24, right: 24, top: 10, height: 48, onTap: () => {} },
				node("label", { left: 0, right: 0, top: 0, bottom: 0 }, "Tap to Increment"),
			),
			node("label", { left: 0, right: 0, top: 8, height: 30 }, "Tap the button to start"),
			node(
				"container",
				{ left: 24, right: 24, top: 12, height: 24 },
				node("content", { left: 0, top: 2, width: 24, height: 20 }),
			),
		),
	)
);

(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "panel should exist");
}).then($DONE, $DONE);
