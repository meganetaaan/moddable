/*---
description: debug native runtime two labels with different font styles.
flags: [async, module]
---*/
import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const styleA = new Style({ font: "semibold 28px Open Sans", color: "#1e293b" });
const styleB = new Style({ font: "52px Open Sans", color: "#0f172a" });

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", { style: styleA }, "A"),
			node("label", { style: styleB }, "B"),
		),
	),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
