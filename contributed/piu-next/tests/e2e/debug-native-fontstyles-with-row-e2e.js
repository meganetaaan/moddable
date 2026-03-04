/*---
description: debug native runtime font styles with row branch.
flags: [async, module]
---*/
import {} from "piu/MC";
import "runtimeBridge";
import { installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

const titleStyle = new Style({ font: "semibold 28px Open Sans", color: "#1e293b", horizontal: "center", vertical: "middle" });
const valueStyle = new Style({ font: "52px Open Sans", color: "#0f172a", horizontal: "center", vertical: "middle" });
const buttonStyle = new Style({ font: "semibold 20px Open Sans", color: "#1d4ed8", horizontal: "center", vertical: "middle" });

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const mounted = mountPiuApplication(() =>
	node("application", {},
		node("column", { left: 24, right: 24, top: 20, bottom: 20 },
			node("label", { left: 0, right: 0, top: 18, height: 40, style: titleStyle }, "piu-next"),
			node("label", { left: 0, right: 0, top: 4, height: 52, style: valueStyle }, "Count: 0"),
			node("row", { left: 24, right: 24, top: 10, height: 48 }, node("label", { left: 0, right: 0, top: 0, bottom: 0, style: buttonStyle }, "Tap to Increment")),
		),
	),
);

Promise.resolve().then(() => {
	screen.doIdle();
	assert.notSameValue(mounted.application.first, null);
}).then($DONE, $DONE);
