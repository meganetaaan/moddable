/*---
description: bypass view debug flag check.
flags: [async, module]
---*/

import { mountPiuApplication } from "piu-runtime";

globalThis.__piuNextBypassView = true;

let mounted;
let message = "";
try {
	mounted = mountPiuApplication(() => {
		throw new Error("view should not run");
	});
	message = "mounted";
}
catch (error) {
	message = String(error?.message ?? error);
}

Promise.resolve().then(() => {
	assert.sameValue(message, "Application failed to mount.", "bypass should skip view and fail mount");
	assert.sameValue(mounted, undefined, "mount should fail");
}).then($DONE, $DONE);
