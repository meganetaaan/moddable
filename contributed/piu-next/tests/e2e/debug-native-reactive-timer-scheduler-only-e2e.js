/*---
description: debug native runtime reactive with Timer scheduler object only.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { batch, createComputed, createSignal, installNativeDriversFromGlobals, mountPiuApplication, node, createRef } from "index";

const count = createSignal(0);
const progress = createSignal(0);
const statusRef = createRef();

const counterText = createComputed(() => `Count: ${count.value}`);
const hintText = createComputed(() => (count.value === 0 ? "Tap the button to start" : "Keep tapping"));
const dotX = createComputed(() => Math.round(progress.value * 188));

const scheduler = {
	now: () => Date.now(),
	every: (intervalMs, callback) => Timer.repeat(callback, intervalMs),
	clear: (handle) => Timer.clear(handle),
};
void scheduler;
let runningTween = null;
void runningTween;

function increment() {
	batch(() => {
		count.update((value) => value + 1);
		progress.set(0);
	});
}

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", { left: 24, right: 24, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 18, height: 40 }, "piu-next"),
			node("label", { ref: statusRef, left: 0, right: 0, top: 4, height: 52 }, counterText.value),
			node("row", { left: 24, right: 24, top: 10, height: 48, active: true, onTap: increment }, node("label", { left: 0, right: 0, top: 0, bottom: 0 }, "Tap to Increment")),
			node("label", { left: 0, right: 0, top: 8, height: 30 }, hintText.value),
			node("container", { left: 24, right: 24, top: 12, height: 24 }, node("content", { left: dotX.value, top: 2, width: 24, height: 20 })),
		),
	),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application, null, "mounted");
}).then($DONE, $DONE);
