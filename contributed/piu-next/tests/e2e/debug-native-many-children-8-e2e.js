/*---
description: debug native runtime many children.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"column",
			{},
			node("label", { string: "1" }),
			node("label", { string: "2" }),
			node("label", { string: "3" }),
			node("label", { string: "4" }),
			node("label", { string: "5" }),
			node("label", { string: "6" }),
			node("label", { string: "7" }),
			node("label", { string: "8" }),

		),
	),
);

Promise.resolve()
.then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null, "column exists");
})
.then($DONE, $DONE);
