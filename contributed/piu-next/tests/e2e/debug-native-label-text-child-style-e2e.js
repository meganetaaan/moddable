/*---
description: debug native runtime label text child with style.
flags: [async, module]
---*/
import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const style = new Style({ font: "semibold 20px Open Sans", color: "#1e293b" });

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", { style }, "A"),
			node("label", { style }, "B"),
		),
	),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
