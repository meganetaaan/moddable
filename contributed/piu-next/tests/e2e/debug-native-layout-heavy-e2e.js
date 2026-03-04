/*---
description: debug native runtime layout-heavy props.
flags: [async, module]
---*/
import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", { left: 24, right: 24, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 18, height: 40, string: "A" }),
			node("label", { left: 0, right: 0, top: 4, height: 52, string: "B" }),
			node("row", { left: 24, right: 24, top: 10, height: 48 }, node("label", { left: 0, right: 0, top: 0, bottom: 0, string: "C" })),
			node("label", { left: 0, right: 0, top: 8, height: 30, string: "D" }),
			node("container", { left: 24, right: 24, top: 12, height: 24 }, node("content", { left: 0, top: 2, width: 24, height: 20 })),
		),
	),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
