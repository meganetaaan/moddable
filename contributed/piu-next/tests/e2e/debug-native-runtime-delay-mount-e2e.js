/*---
description: debug native runtime delayed mount.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

let mounted = null;

Timer.set(() => {
	mounted = mountPiuApplication(() =>
		node("application", {}, node("label", { string: "Count: 0" })),
	);
}, 15000);

Promise.resolve()
.then(async () => {
	Timer.delay(15200);
	await Promise.resolve();
	screen.doIdle();
	assert.notSameValue(mounted, null, "mounted should exist");
	assert.sameValue(mounted.application.first.string, "Count: 0", "mounted label");
})
.then($DONE, $DONE);
