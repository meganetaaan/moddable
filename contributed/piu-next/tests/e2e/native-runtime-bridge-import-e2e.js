/*---
description: native runtime bridge module imports and injects global bridge.
flags: [async, module]
---*/

import "runtimeBridge";

Promise.resolve()
.then(() => {
	assert.notSameValue(globalThis.__piuNextRuntimeBridge, undefined, "bridge should be injected");
})
.then($DONE, $DONE);
