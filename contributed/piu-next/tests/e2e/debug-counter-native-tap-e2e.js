/*---
description: debug native counter taps without empty patch.
flags: [async, module]
---*/

import Time from "time";
import { installNativeDriversFromGlobals } from "drivers";
import "runtimeBridge";

function resolveTouchPoint(application, content) {
	for (let y = 0; y < screen.height; y += 2) {
		for (let x = 0; x < screen.width; x += 2) {
			if (application.hit(x, y) === content)
				return { x, y };
		}
	}
	return null;
}

function getCounterParts(application) {
	const panel = application.first;
	const title = panel.first;
	const counterLabel = title.next;
	const buttonRow = counterLabel.next;
	return { counterLabel, buttonRow };
}

async function tap(point) {
	screen.context.onTouchBegan(0, point.x, point.y, Time.ticks);
	screen.context.onTouchEnded(0, point.x, point.y, Time.ticks);
	await Promise.resolve();
	screen.doIdle();
}

Promise.resolve()
.then(async () => {
	globalThis.__piuNextEnableNativeRuntimeBridge = true;
	installNativeDriversFromGlobals();
	await import("counterMain");

	const application = globalThis.application;
	screen.doIdle();

	const point = resolveTouchPoint(application, getCounterParts(application).buttonRow);
	await tap(point);
	await tap(point);
	assert.sameValue(getCounterParts(application).counterLabel.string, "Count: 2", "counter increments");
})
.then($DONE, $DONE);
