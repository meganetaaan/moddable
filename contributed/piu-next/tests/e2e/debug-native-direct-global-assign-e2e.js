/*---
description: debug native runtime with global application assignment.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { createComputed, createSignal } from "signal";
import { createRef } from "ref";
import { installNativeDriversFromGlobals } from "drivers";
import { mountPiuApplication } from "piu-runtime";
import { node } from "ir";

const count = createSignal(0);
const statusRef = createRef();
const counterText = createComputed(() => `Count: ${count.value}`);

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", {}, "piu-next"),
			node("label", { ref: statusRef }, counterText.value),
		),
	),
);

(globalThis).application = mounted.application;
trace("piu-next counter-app started\n");

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application, null, "mounted");
}).then($DONE, $DONE);
