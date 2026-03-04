/*---
description: native runtime bridge enabled path mounts and updates.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { createSignal, installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const count = createSignal(0);
const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node("label", { string: `Count: ${count.value}` }),
	)
);

Promise.resolve()
.then(async () => {
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 0", "initial label");

	count.set(1);
	Timer.delay(1);
	await Promise.resolve();
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 1", "updated label");
})
.then($DONE, $DONE);
