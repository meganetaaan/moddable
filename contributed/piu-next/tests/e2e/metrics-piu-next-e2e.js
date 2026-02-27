/*---
description: instrumentation metrics for piu-next touch handling.
flags: [async, module]
---*/

import Instrumentation from "instrumentation";
import Time from "time";
import "counterMain";

const indexes = {
	slotHeap: Instrumentation.map("XS Slot Heap Used"),
	chunkHeap: Instrumentation.map("XS Chunk Heap Used"),
	stack: Instrumentation.map("XS Stack Used"),
	piuCommandList: Instrumentation.map("Piu Command List Used"),
	promisesSettled: Instrumentation.map("XS Promises Settled"),
};

function snapshot(label) {
	const values = {
		slotHeap: (indexes.slotHeap !== undefined) ? Instrumentation.get(indexes.slotHeap) : undefined,
		chunkHeap: (indexes.chunkHeap !== undefined) ? Instrumentation.get(indexes.chunkHeap) : undefined,
		stack: (indexes.stack !== undefined) ? Instrumentation.get(indexes.stack) : undefined,
		piuCommandList: (indexes.piuCommandList !== undefined) ? Instrumentation.get(indexes.piuCommandList) : undefined,
		promisesSettled: (indexes.promisesSettled !== undefined) ? Instrumentation.get(indexes.promisesSettled) : undefined,
	};
	return { label, ...values };
}

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

async function tap(application) {
	const point = resolveTouchPoint(application, getCounterParts(application).buttonRow);
	assert.notSameValue(point, null, "button touch point should resolve");
	snapshots.push(snapshot("beforeTap_began"));
	screen.context.onTouchBegan(0, point.x, point.y, Time.ticks);
	snapshots.push(snapshot("afterTap_began"));
	screen.context.onTouchEnded(0, point.x, point.y, Time.ticks);
	snapshots.push(snapshot("afterTap_ended"));
	await Promise.resolve();
	snapshots.push(snapshot("afterTap_microtask"));
	screen.doIdle();
	snapshots.push(snapshot("afterTap_idle"));
}

const snapshots = [];

Promise.resolve()
.then(async () => {
	const application = globalThis.application;
	assert.notSameValue(application, null, "application should be mounted");
	screen.doIdle();
	snapshots.push(snapshot("initial"));
	assert.sameValue(getCounterParts(application).counterLabel.string, "Count: 0", "initial counter");

	await tap(application);
	assert.sameValue(getCounterParts(application).counterLabel.string, "Count: 1", "first tap increments");
	await tap(application);
	assert.sameValue(getCounterParts(application).counterLabel.string, "Count: 2", "second tap increments");
	trace(`METRIC-REPORT piu-next ${JSON.stringify({ snapshots })}\n`);
	$DONE();
})
.then(undefined, $DONE);
