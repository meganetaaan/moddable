/*---
description: debug native runtime shared style across labels.
flags: [async, module]
---*/
import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const style = new Style({ color: "#1e293b" });

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();
trace("debug: before mount\n");

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", { style, string: "A" }),
			node("label", { style, string: "B" }),
		),
	),
);
trace("debug: after mount\n");

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
