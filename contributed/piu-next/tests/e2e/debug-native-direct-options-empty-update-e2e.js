/*---
description: debug native runtime direct imports with empty options object and one update.
flags: [async, module]
---*/

import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { batch, createComputed, createSignal } from "signal";
import { installNativeDriversFromGlobals } from "drivers";
import { mountPiuApplication } from "piu-runtime";
import { node } from "ir";

const count = createSignal(0);
const counterText = createComputed(() => `Count: ${count.value}`);
const hintText = createComputed(() => (count.value === 0 ? "Tap the button to start" : "Keep tapping"));

function increment() {
	batch(() => {
		count.update((v) => v + 1);
	});
}

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", {}, "piu-next"),
			node("label", {}, counterText.value),
			node("row", { active: true, onTap: increment }, node("label", {}, "Tap to Increment")),
			node("label", {}, hintText.value),
		),
	),
	{},
);

Promise.resolve()
.then(async () => {
	screen.doIdle();
	const panel = mounted.application.first;
	const title = panel.first;
	const counterLabel = title.next;
	assert.sameValue(counterLabel.string, "Count: 0", "initial");

	increment();
	Timer.delay(1);
	await Promise.resolve();
	screen.doIdle();
	assert.sameValue(counterLabel.string, "Count: 1", "updated");
})
.then($DONE, $DONE);
