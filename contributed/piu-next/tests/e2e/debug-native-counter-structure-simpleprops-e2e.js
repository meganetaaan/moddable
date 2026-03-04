/*---
description: debug native runtime counter-like structure simple props.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const skinA = new Skin({ fill: "#f2f4f8" });
const skinB = new Skin({ fill: "#ffffff" });
const styleA = new Style({ color: "#1e293b" });

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{ skin: skinA },
		node(
			"column",
			{ left: 24, right: 24, top: 20, bottom: 20, skin: skinB },
			node("label", { left: 0, right: 0, top: 18, height: 40, style: styleA }, "piu-next"),
			node("label", { left: 0, right: 0, top: 4, height: 52, style: styleA }, "Count: 0"),
			node(
				"row",
				{ left: 24, right: 24, top: 10, height: 48 },
				node("label", { left: 0, right: 0, top: 0, bottom: 0, style: styleA }, "Tap to Increment"),
			),
			node("label", { left: 0, right: 0, top: 8, height: 30, style: styleA }, "Tap the button to start"),
			node(
				"container",
				{ left: 24, right: 24, top: 12, height: 24 },
				node("content", { left: 0, top: 2, width: 24, height: 20 }),
			),
		),
	),
);

Promise.resolve()
.then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null, "panel exists");
})
.then($DONE, $DONE);
