/*---
description: piu-runtime mounts a complex static tree.
flags: [async, module]
---*/

import {} from "piu/MC";
import { node } from "ir";
import { mountPiuApplication } from "piu-runtime";

const skinA = new Skin({ fill: "#f2f4f8" });
const skinB = new Skin({ fill: "#ffffff" });
const skinC = new Skin({ fill: "#dbeafe" });
const skinD = new Skin({ fill: "#e5e7eb" });
const skinE = new Skin({ fill: "#2563eb" });

const styleA = new Style({ font: "semibold 28px Open Sans", color: "#1e293b", horizontal: "center", vertical: "middle" });
const styleB = new Style({ font: "52px Open Sans", color: "#0f172a", horizontal: "center", vertical: "middle" });
const styleC = new Style({ font: "semibold 20px Open Sans", color: "#1d4ed8", horizontal: "center", vertical: "middle" });
const styleD = new Style({ font: "18px Open Sans", color: "#475569", horizontal: "center", vertical: "middle" });

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{ skin: skinA },
		node(
			"column",
			{ left: 24, right: 24, top: 20, bottom: 20, skin: skinB },
			node("label", { left: 0, right: 0, top: 18, height: 40, style: styleA }, "piu-next"),
			node("label", { left: 0, right: 0, top: 4, height: 52, style: styleB }, "Count: 0"),
			node(
				"row",
				{ left: 24, right: 24, top: 10, height: 48, skin: skinC, onTap: () => {} },
				node("label", { left: 0, right: 0, top: 0, bottom: 0, style: styleC }, "Tap to Increment"),
			),
			node("label", { left: 0, right: 0, top: 8, height: 30, style: styleD }, "Tap the button to start"),
			node(
				"container",
				{ left: 24, right: 24, top: 12, height: 24, skin: skinD },
				node("content", { left: 0, top: 2, width: 24, height: 20, skin: skinE }),
			),
		),
	)
);

(globalThis).application = mounted.application;

Promise.resolve().then(() => {
	screen.doIdle();
	const panel = globalThis.application.first;
	assert.notSameValue(panel, null, "panel should exist");
}).then($DONE, $DONE);
