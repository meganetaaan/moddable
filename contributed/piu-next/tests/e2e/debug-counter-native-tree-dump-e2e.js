/*---
description: dump native counter tree nodes.
flags: [async, module]
---*/

import { installNativeDriversFromGlobals } from "drivers";
import "runtimeBridge";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

Promise.resolve().then(async () => {
	await import("counterMain");
	const application = globalThis.application;
	screen.doIdle();
	trace(`app.first=${application.first}\n`);
	const panel = application.first;
	let node = panel ? panel.first : null;
	let index = 0;
	while (node && (index < 12)) {
		trace(`node[${index}] string=${node.string} width=${node.width} height=${node.height}\n`);
		node = node.next;
		index += 1;
	}
	assert.sameValue(true, true, "dump done");
}).then($DONE, $DONE);
