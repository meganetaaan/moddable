/*---
description: debug JS runtime shared style across labels.
flags: [async, module]
---*/
import {} from "piu/MC";
import { mountPiuApplication, node } from "index";

const style = new Style({ color: "#1e293b" });
trace("debug: before mount js\n");
const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", { style, string: "A" }),
			node("label", { style, string: "B" }),
		),
	),
);
trace("debug: after mount js\n");

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
