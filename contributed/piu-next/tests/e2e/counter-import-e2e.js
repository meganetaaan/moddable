/*---
description: import counterMain with dynamic import for error capture.
flags: [async, module]
---*/

Promise.resolve()
.then(async () => {
	await import("counterMain");
	assert.notSameValue(globalThis.application, null, "application should exist after import");
})
.then($DONE, $DONE);
