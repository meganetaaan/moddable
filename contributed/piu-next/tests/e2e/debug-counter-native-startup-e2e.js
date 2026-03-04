/*---
description: debug native counter startup.
flags: [async, module]
---*/

import { installNativeDriversFromGlobals } from "drivers";
import "runtimeBridge";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

Promise.resolve()
.then(async () => {
	await import("counterMain");
	const application = globalThis.application;
	assert.notSameValue(application, null, "application should mount");
	screen.doIdle();
	const panel = application.first;
	const title = panel.first;
	const counterLabel = title.next;
	assert.sameValue(counterLabel.string, "Count: 0", "initial counter");
})
.then($DONE, $DONE);
