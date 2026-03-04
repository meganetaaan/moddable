/*---
description: piu-runtime mounts with computed signals.
flags: [async, module]
---*/

import {} from "piu/MC";
import { createComputed, createSignal } from "signal";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const count = createSignal(0);
const title = createComputed(() => `Count: ${count.value}`);

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node("label", { string: title.value })
	)
);

(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.sameValue(globalThis.application.first.string, "Count: 0", "initial computed");
	count.set(1);
	assert.sameValue(globalThis.application.first.string, "Count: 1", "updated computed");
}).then($DONE, $DONE);
