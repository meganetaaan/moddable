/*---
description: native runtime bridge reconciles keyed reorder and add/remove.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { createSignal, installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const reversed = createSignal(false);

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		reversed.value
			? node("label", { key: "b", string: "B" })
			: node("label", { key: "a", string: "A" }),
		reversed.value
			? node("label", { key: "a", string: "A" })
			: node("label", { key: "b", string: "B" }),
	),
);

function flush() {
	Timer.delay(1);
	return Promise.resolve().then(() => {
		screen.doIdle();
	});
}

Promise.resolve()
.then(async () => {
	screen.doIdle();
	const labelA = mounted.application.first;
	const labelB = labelA.next;
	assert.sameValue(labelA.string, "A", "first is A");
	assert.sameValue(labelB.string, "B", "second is B");

	reversed.set(true);
	await flush();
	assert.sameValue(mounted.application.first, labelB, "B should move to first");
	assert.sameValue(mounted.application.first.next, labelA, "A should move to second");
})
.then($DONE, $DONE);
