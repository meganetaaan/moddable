/*---
description: counter-app increments on two taps without overflow.
flags: [async, module]
---*/

import Time from "time";
import "counterMain";

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
	assert.notSameValue(panel, null, "panel should exist");
	const title = panel.first;
	assert.notSameValue(title, null, "title should exist");
	const counterLabel = title.next;
	assert.notSameValue(counterLabel, null, "counter label should exist");
	const buttonRow = counterLabel.next;
	assert.notSameValue(buttonRow, null, "button row should exist");
	return { counterLabel, buttonRow };
}

async function tap(application) {
	const point = resolveTouchPoint(application, getCounterParts(application).buttonRow);
	assert.notSameValue(point, null, "button touch point should resolve");
	screen.context.onTouchBegan(0, point.x, point.y, Time.ticks);
	screen.context.onTouchEnded(0, point.x, point.y, Time.ticks);
	await Promise.resolve();
	screen.doIdle();
}

Promise.resolve()
.then(async () => {
	const application = globalThis.application;
	assert.notSameValue(application, null, "application should be mounted");

	screen.doIdle();
	assert.sameValue(getCounterParts(application).counterLabel.string, "Count: 0", "initial counter");

	await tap(application);
	assert.sameValue(getCounterParts(application).counterLabel.string, "Count: 1", "first tap increments");

	await tap(application);
	assert.sameValue(getCounterParts(application).counterLabel.string, "Count: 2", "second tap increments");
})
.then($DONE, $DONE);
