/*---
description: reference runtime driver mounts and updates in mcsim.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import { createReferenceRuntimeDriver, createSignal, mountPiuApplication, node } from "index";

const count = createSignal(0);

const mounted = mountPiuApplication(
	() =>
		node(
			"application",
			{},
			node("label", { string: `Count: ${count.value}` }),
		),
	{
		taskQueue: {
			post(task) {
				Timer.set(task, 0);
			},
		},
		driver: createReferenceRuntimeDriver(),
	},
);

Promise.resolve()
.then(async () => {
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 0", "initial label");
	count.set(1);
	await Promise.resolve();
	screen.doIdle();
	assert.sameValue(mounted.application.first.string, "Count: 1", "updated label");
})
.then($DONE, $DONE);
