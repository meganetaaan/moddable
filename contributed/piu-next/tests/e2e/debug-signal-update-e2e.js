/*---
description: debug reactive update outside touch path.
flags: [async, module]
---*/

import {} from "piu/MC";
import { createSignal, createComputed } from "signal";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const count = createSignal(0);
const text = createComputed(() => `Count: ${count.value}`);
const mounted = mountPiuApplication(() =>
	node("application", {}, node("label", { left: 0, right: 0, top: 0, height: 40 }, text.value))
);
(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.sameValue(globalThis.application.first.string, "Count: 0", "initial");
	count.set(1);
	screen.doIdle();
	assert.sameValue(globalThis.application.first.string, "Count: 1", "updated");
}).then($DONE, $DONE);
