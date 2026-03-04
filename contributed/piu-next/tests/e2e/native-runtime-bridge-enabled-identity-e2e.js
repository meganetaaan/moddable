/*---
description: native runtime bridge preserves node identity on prop updates.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { createSignal, installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const count = createSignal(0);
const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node("label", { string: `Count: ${count.value}` }),
	)
);

Promise.resolve()
.then(async () => {
	screen.doIdle();
	const initialLabel = mounted.application.first;
	assert.notSameValue(initialLabel, null, "initial label should exist");
	assert.sameValue(initialLabel.string, "Count: 0", "initial label text");
	initialLabel.__piuNextIdentityMarker = 1;

	count.set(1);
	Timer.delay(1);
	await Promise.resolve();
	screen.doIdle();

	assert.sameValue(mounted.application.first.__piuNextIdentityMarker, 1, "label identity should be preserved");
	assert.sameValue(mounted.application.first.string, "Count: 1", "label text should update in place");
})
.then($DONE, $DONE);
