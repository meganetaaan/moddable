/*---
description: baseline Piu with JS nested host-reference tree.
flags: [async, module]
---*/

import {} from "piu/MC";

const leaf1 = new Label(null, { string: "Top" });
const leaf2 = new Label(null, { string: "Tap" });
const row = new Row(null, { left: 20, right: 20, top: 10, height: 40, contents: [leaf2] });
const column = new Column(null, { left: 0, right: 0, top: 0, bottom: 0, contents: [leaf1, row] });
const app = new Application(null, { contents: [column] });
(globalThis).application = app;

(globalThis).__tree = {
	content: column,
	children: [
		{ content: leaf1, children: [] },
		{ content: row, children: [{ content: leaf2, children: [] }] },
	],
};

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "column");
}).then($DONE, $DONE);
