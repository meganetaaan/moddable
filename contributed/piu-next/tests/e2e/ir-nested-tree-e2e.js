/*---
description: build nested IR tree only.
flags: [async, module]
---*/

import { node } from "ir";

const tree = node(
	"application",
	{},
	node(
		"column",
		{ left: 0, right: 0, top: 0, bottom: 0 },
		node(
			"row",
			{ left: 20, right: 20, top: 10, height: 40 },
			node("label", { string: "Tap" }),
		),
	),
);

Promise.resolve().then(() => {
	assert.sameValue(tree.kind, "element", "tree kind");
	assert.sameValue(tree.type, "application", "tree type");
}).then($DONE, $DONE);
