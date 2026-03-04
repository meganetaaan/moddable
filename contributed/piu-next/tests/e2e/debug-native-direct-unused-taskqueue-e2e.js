/*---
description: debug native runtime with unused taskQueue object.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { batch, createComputed, createSignal } from "signal";
import { createRef } from "ref";
import { installNativeDriversFromGlobals } from "drivers";
import { mountPiuApplication } from "piu-runtime";
import { node } from "ir";

const count = createSignal(0);
const progress = createSignal(0);
const statusRef = createRef();
const counterText = createComputed(() => `Count: ${count.value}`);
const hintText = createComputed(() => (count.value === 0 ? "Tap the button to start" : "Keep tapping"));
const dotX = createComputed(() => Math.round(progress.value * 188));
const taskQueue = { post(task) { Timer.set(task, 0); } };
void taskQueue;
function increment() { batch(() => { count.update((v) => v + 1); progress.set(0); }); }

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", {}, "piu-next"),
			node("label", { ref: statusRef }, counterText.value),
			node("row", { active: true, onTap: increment }, node("label", {}, "Tap to Increment")),
			node("label", {}, hintText.value),
			node("container", {}, node("content", { left: dotX.value, width: 24, height: 20 })),
		),
	),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application, null, "mounted");
}).then($DONE, $DONE);
