/*---
description: debug native runtime with container/content branch.
flags: [async, module]
---*/
import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", { string: "A" }),
			node("label", { string: "B" }),
			node("row", {}, node("label", { string: "C" })),
			node("label", { string: "D" }),
			node("container", {}, node("content", { left: 0, top: 2, width: 24, height: 20 })),
		),
	),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
