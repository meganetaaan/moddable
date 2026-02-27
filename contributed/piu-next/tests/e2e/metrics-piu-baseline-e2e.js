/*---
description: instrumentation metrics for baseline Piu touch handling.
flags: [async, module]
---*/

import Instrumentation from "instrumentation";
import Time from "time";

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

let count = 0;
let counterLabel;
const snapshots = [];

class ButtonBehavior extends $TESTMC.Behavior {
	onTouchEnded(row, id, x, y, ticks) {
		snapshots.push(snapshot("inHandler_beforeUpdate"));
		count += 1;
		counterLabel.string = `Count: ${count}`;
		snapshots.push(snapshot("inHandler_afterUpdate"));
	}
}

const app = new Application(null, {
	contents: [
		new Column(null, {
			left: 0, right: 0, top: 0, bottom: 0,
			contents: [
				new Label(null, {
					left: 0, right: 0, top: 20, height: 40, string: "baseline",
				}),
				(counterLabel = new Label(null, {
					left: 0, right: 0, top: 10, height: 40, string: "Count: 0",
				})),
				new Row(null, {
					left: 20, right: 20, top: 10, height: 40,
					active: true,
					Behavior: ButtonBehavior,
					contents: [
						new Label(null, { left: 0, right: 0, top: 0, bottom: 0, string: "Tap" }),
					],
				}),
			],
		}),
	],
});

function tap(point) {
	snapshots.push(snapshot("beforeTap_began"));
	screen.context.onTouchBegan(0, point.x, point.y, Time.ticks);
	snapshots.push(snapshot("afterTap_began"));
	screen.context.onTouchEnded(0, point.x, point.y, Time.ticks);
	snapshots.push(snapshot("afterTap_ended"));
	screen.doIdle();
	snapshots.push(snapshot("afterTap_idle"));
}

Promise.resolve()
.then(() => {
	screen.doIdle();
	snapshots.push(snapshot("initial"));
	const column = app.first;
	const buttonRow = column.last;
	const point = resolveTouchPoint(app, buttonRow);
	assert.notSameValue(point, null, "button touch point should resolve");

	tap(point);
	assert.sameValue(counterLabel.string, "Count: 1", "first tap increments");
	tap(point);
	assert.sameValue(counterLabel.string, "Count: 2", "second tap increments");
	trace(`METRIC-REPORT baseline ${JSON.stringify({ snapshots })}\n`);
	$DONE();
}, $DONE);
