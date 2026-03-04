/*---
description: debug tap signal update with task queue.
flags: [async, module]
---*/

import {} from "piu/MC";
import Time from "time";
import Timer from "timer";
import { createSignal, createComputed } from "signal";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

globalThis.__piuNextTrace = true;

const count = createSignal(0);
const text = createComputed(() => `Count: ${count.value}`);

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"column",
			{ left: 20, right: 20, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 0, height: 40 }, text.value),
			node(
				"row",
				{ left: 0, right: 0, top: 10, height: 40, active: true, onTap: () => { count.set(count.value + 1); } },
				node("label", { left: 0, right: 0, top: 0, bottom: 0 }, "Tap")
			),
		),
	),
	{
		taskQueue: {
			post(task) {
				Timer.set(task, 0);
			},
		},
	}
);

(globalThis).application = mounted.application;

function findPoint(app, target) {
	for (let y = 0; y < screen.height; y += 2) {
		for (let x = 0; x < screen.width; x += 2) {
			if (app.hit(x, y) === target)
				return { x, y };
		}
	}
	return null;
}

Promise.resolve().then(async () => {
	const app = globalThis.application;
	screen.doIdle();
	const panel = app.first;
	const label = panel.first;
	const row = label.next;
	assert.sameValue(label.string, "Count: 0", "initial count");
	const point = findPoint(app, row);
	assert.notSameValue(point, null, "tap point exists");
	screen.context.onTouchBegan(0, point.x, point.y, Time.ticks);
	screen.context.onTouchEnded(0, point.x, point.y, Time.ticks);
	await Promise.resolve();
	screen.doIdle();
	assert.sameValue(panel.first.string, "Count: 1", "count increments");
}).then($DONE, $DONE);
