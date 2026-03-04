/*---
description: debug native runtime style/skin startup.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const skin = new Skin({ fill: "#ffffff" });
const style = new Style({ font: "semibold 20px Open Sans", color: "#1d4ed8" });

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{ skin },
		node("label", { left: 0, right: 0, top: 0, height: 32, style }, "Hello"),
	),
);

Promise.resolve()
.then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null, "label exists");
})
.then($DONE, $DONE);
