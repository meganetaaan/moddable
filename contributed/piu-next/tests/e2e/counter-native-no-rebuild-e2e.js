/*---
description: counter-app native runtime updates without full rebuild.
flags: [async, module]
---*/

import { installNativeDriversFromGlobals } from "drivers";
import "runtimeBridge";

function getCounterLabel(application) {
	const panel = application.first;
	assert.notSameValue(panel, null, "panel should exist");
	const title = panel.first;
	assert.notSameValue(title, null, "title should exist");
	const counterLabel = title.next;
	assert.notSameValue(counterLabel, null, "counter label should exist");
	return counterLabel;
}

Promise.resolve()
.then(async () => {
	globalThis.__piuNextEnableNativeRuntimeBridge = true;
	installNativeDriversFromGlobals();
	await import("counterMain");

	const application = globalThis.application;
	assert.notSameValue(application, null, "application should be mounted");
	const increment = globalThis.__piuNextCounterIncrement;
	assert.sameValue(typeof increment, "function", "counter increment hook should be exposed");
	screen.doIdle();

	const panelBefore = application.first;
	assert.notSameValue(panelBefore, null, "panel should exist before update");
	const titleBefore = panelBefore.first;
	assert.notSameValue(titleBefore, null, "title should exist before update");
	const counterLabelBefore = titleBefore.next;
	assert.notSameValue(counterLabelBefore, null, "counter label should exist before update");

	increment();
	await Promise.resolve();
	screen.doIdle();
	assert.sameValue(application.first, panelBefore, "panel identity should be preserved");
	assert.sameValue(application.first.first, titleBefore, "title identity should be preserved");
	assert.sameValue(getCounterLabel(application), counterLabelBefore, "counter label identity should be preserved");
	assert.sameValue(counterLabelBefore.string, "Count: 1", "counter increments");
})
.then($DONE, $DONE);
