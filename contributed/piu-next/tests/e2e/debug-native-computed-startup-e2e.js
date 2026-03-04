/*---
description: debug native runtime with computed values.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { createComputed, createSignal, installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const count = createSignal(0);
const text = createComputed(() => `Count: ${count.value}`);

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node("label", { string: text.value }),
	),
);

Promise.resolve()
.then(() => {
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 0", "computed label");
})
.then($DONE, $DONE);
