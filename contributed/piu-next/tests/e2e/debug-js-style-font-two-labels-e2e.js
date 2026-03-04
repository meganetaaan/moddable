/*---
description: debug JS runtime style with font two labels.
flags: [async, module]
---*/
import {} from "piu/MC";
import { mountPiuApplication, node } from "index";

const style = new Style({ font: "semibold 20px Open Sans", color: "#1e293b" });
trace("debug: before mount font-two\n");
const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", {},
			node("label", { style, string: "A" }),
			node("label", { style, string: "B" }),
		),
	),
);
trace("debug: after mount font-two\n");
Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
