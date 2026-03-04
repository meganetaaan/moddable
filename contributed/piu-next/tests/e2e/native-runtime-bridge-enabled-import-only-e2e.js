/*---
description: native runtime bridge enabled import-only smoke.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

Promise.resolve()
.then(() => {
	assert.notSameValue(globalThis.__piuNextRuntimeBridge, undefined, "bridge should exist");
})
.then($DONE, $DONE);
