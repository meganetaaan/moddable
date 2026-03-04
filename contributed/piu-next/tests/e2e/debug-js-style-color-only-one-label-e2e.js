/*---
description: debug JS runtime style color only one label.
flags: [async, module]
---*/
import {} from "piu/MC";
import { mountPiuApplication, node } from "index";

const style = new Style({ color: "#1e293b" });
trace("debug: before mount color-only\n");
const mounted = mountPiuApplication(() =>
	node("application", {},
		node("label", { style, string: "A" }),
	),
);
trace("debug: after mount color-only\n");
Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
