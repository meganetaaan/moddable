/*---
description: sanity test.
flags: [async, module]
---*/

Promise.resolve().then(() => {
	assert.sameValue(1, 1, "sanity");
}).then($DONE, $DONE);
