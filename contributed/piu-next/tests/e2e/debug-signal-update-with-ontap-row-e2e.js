/*---
description: debug signal update with onTap row present.
flags: [async, module]
---*/

import {} from "piu/MC";
import { createSignal, createComputed } from "signal";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const count = createSignal(0);
const text = createComputed(() => `Count: ${count.value}`);
const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"column",
			{ left: 20, right: 20, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 0, height: 40 }, text.value),
			node("row", { left: 0, right: 0, top: 10, height: 40, active: true, onTap: () => {} }, node("label", {}, "Tap")),
		)
	)
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	const panel = globalThis.application.first;
	assert.sameValue(panel.first.string, "Count: 0", "initial");
	count.set(1);
	screen.doIdle();
	assert.sameValue(panel.first.string, "Count: 1", "updated");
}).then($DONE, $DONE);
