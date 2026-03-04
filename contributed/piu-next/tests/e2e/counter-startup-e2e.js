/*---
description: counter-app starts and renders initial state.
flags: [async, module]
---*/

import "counterMain";

Promise.resolve()
.then(() => {
	const application = globalThis.application;
	assert.notSameValue(application, null, "application should be mounted");
	screen.doIdle();

	const panel = application.first;
	assert.notSameValue(panel, null, "panel should exist");
	const title = panel.first;
	assert.notSameValue(title, null, "title should exist");
	const counterLabel = title.next;
	assert.sameValue(counterLabel.string, "Count: 0", "initial counter");
})
.then($DONE, $DONE);
