/*---
description: inspect runtime-generated tree links.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"column",
			{ left: 20, right: 20, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 0, height: 40 }, "Count: 0"),
			node(
				"row",
				{ left: 0, right: 0, top: 10, height: 40, active: true },
				node("label", { left: 0, right: 0, top: 0, bottom: 0 }, "Tap")
			),
		),
	)
);
(globalThis).application = mounted.application;

function chain(content) {
	const seen = [];
	let current = content;
	for (let i = 0; i < 10; i += 1) {
		if (!current)
			break;
		seen.push(current);
		current = current.container;
	}
	return seen;
}

Promise.resolve().then(() => {
	screen.doIdle();
	const app = globalThis.application;
	const panel = app.first;
	const top = panel.first;
	const row = top.next;
	assert.sameValue(panel.container, app, "panel.container");
	assert.sameValue(top.container, panel, "top.container");
	assert.sameValue(row.container, panel, "row.container");
	const rowChain = chain(row);
	assert.sameValue(rowChain[0], row, "chain row");
	assert.sameValue(rowChain[1], panel, "chain panel");
	assert.sameValue(rowChain[2], app, "chain app");
	assert.sameValue(rowChain[3], undefined, "chain root should terminate");
}).then($DONE, $DONE);
