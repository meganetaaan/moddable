/*---
description: debug native runtime simple startup with custom taskQueue.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { createSignal, installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const count = createSignal(0);
const taskQueue = { post(task) { Timer.set(task, 0); } };

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("label", { string: `Count: ${count.value}` }),
	),
	{ taskQueue },
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 0");
}).then($DONE, $DONE);
