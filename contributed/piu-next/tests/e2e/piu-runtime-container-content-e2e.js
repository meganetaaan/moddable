/*---
description: piu-runtime mounts container with content child.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const trackSkin = new Skin({ fill: "#e5e7eb" });
const dotSkin = new Skin({ fill: "#2563eb" });

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node(
			"container",
			{ left: 24, right: 24, top: 12, height: 24, skin: trackSkin },
			node("content", { left: 0, top: 2, width: 24, height: 20, skin: dotSkin }),
		),
	)
);

(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(globalThis.application.first, null, "container should exist");
}).then($DONE, $DONE);
