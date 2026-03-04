/*---
description: debug native runtime complex direct imports with global assignment.
flags: [async, module]
---*/

import {} from "piu/MC";
import "runtimeBridge";
import { batch, createComputed, createSignal } from "signal";
import { createRef } from "ref";
import { installNativeDriversFromGlobals } from "drivers";
import { mountPiuApplication } from "piu-runtime";
import { node } from "ir";

const appSkin = new Skin({ fill: "#f2f4f8" });
const panelSkin = new Skin({ fill: "#ffffff", borders: { left: 2, right: 2, top: 2, bottom: 2 }, stroke: "#d6dbe4" });
const buttonSkin = new Skin({ fill: ["#dbeafe", "#bfdbfe", "#93c5fd"] });
const trackSkin = new Skin({ fill: "#e5e7eb" });
const dotSkin = new Skin({ fill: "#2563eb" });

const titleStyle = new Style({ font: "semibold 28px Open Sans", color: "#1e293b", horizontal: "center", vertical: "middle" });
const valueStyle = new Style({ font: "52px Open Sans", color: "#0f172a", horizontal: "center", vertical: "middle" });
const buttonStyle = new Style({ font: "semibold 20px Open Sans", color: "#1d4ed8", horizontal: "center", vertical: "middle" });
const hintStyle = new Style({ font: "18px Open Sans", color: "#475569", horizontal: "center", vertical: "middle" });

const count = createSignal(0);
const progress = createSignal(0);
const statusRef = createRef();

const counterText = createComputed(() => `Count: ${count.value}`);
const hintText = createComputed(() => {
	if (count.value === 0)
		return "Tap the button to start";
	return "Keep tapping";
});
const dotX = createComputed(() => Math.round(progress.value * 188));

function increment() {
	batch(() => {
		count.update((value) => value + 1);
		progress.set(0);
	});
}

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", { skin: appSkin },
		node("column", { left: 24, right: 24, top: 20, bottom: 20, skin: panelSkin },
			node("label", { left: 0, right: 0, top: 18, height: 40, style: titleStyle }, "piu-next"),
			node("label", { ref: statusRef, left: 0, right: 0, top: 4, height: 52, style: valueStyle }, counterText.value),
			node("row", { left: 24, right: 24, top: 10, height: 48, active: true, skin: buttonSkin, onTap: increment }, node("label", { left: 0, right: 0, top: 0, bottom: 0, style: buttonStyle }, "Tap to Increment")),
			node("label", { left: 0, right: 0, top: 8, height: 30, style: hintStyle }, hintText.value),
			node("container", { left: 24, right: 24, top: 12, height: 24, skin: trackSkin }, node("content", { left: dotX.value, top: 2, width: 24, height: 20, skin: dotSkin })),
		),
	),
);

(globalThis).application = mounted.application;
(globalThis).__piuNextCounterIncrement = increment;
trace("piu-next counter-app started\n");

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application, null, "mounted");
}).then($DONE, $DONE);
