/*---
description: native runtime bridge mounts application once.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node("label", { string: "Count: 0" }),
	)
);

Promise.resolve()
.then(() => {
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 0", "mounted label");
})
.then($DONE, $DONE);
