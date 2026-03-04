/*---
description: debug native runtime nested container startup.
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
			node("label", { string: "A" }),
			node(
				"row",
				{},
				node("label", { string: "B" }),
				node("content", { width: 10, height: 10 }),
			),
		),
	),
);

Promise.resolve()
.then(() => {
	screen.doIdle();
	assert.sameValue(mounted.application.first.first.string, "A", "nested label A");
})
.then($DONE, $DONE);
