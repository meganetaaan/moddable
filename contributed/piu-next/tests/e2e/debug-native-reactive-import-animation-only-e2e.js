/*---
description: debug native runtime reactive with animation import only.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { createComputed, createSignal, installNativeDriversFromGlobals, mountPiuApplication, node, easings, tweenSignal } from "index";

void easings;
void tweenSignal;

const count = createSignal(0);
const text = createComputed(() => `Count: ${count.value}`);

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {}, node("label", { string: text.value })),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 0");
}).then($DONE, $DONE);
