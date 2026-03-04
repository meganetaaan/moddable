/*---
description: create counter-app skins and styles.
flags: [async, module]
---*/

import {} from "piu/MC";

const appSkin = new Skin({ fill: "#f2f4f8" });
const panelSkin = new Skin({ fill: "#ffffff", borders: { left: 2, right: 2, top: 2, bottom: 2 }, stroke: "#d6dbe4" });
const buttonSkin = new Skin({ fill: ["#dbeafe", "#bfdbfe", "#93c5fd"] });
const trackSkin = new Skin({ fill: "#e5e7eb" });
const dotSkin = new Skin({ fill: "#2563eb" });

const titleStyle = new Style({ font: "semibold 28px Open Sans", color: "#1e293b", horizontal: "center", vertical: "middle" });
const valueStyle = new Style({ font: "52px Open Sans", color: "#0f172a", horizontal: "center", vertical: "middle" });
const buttonStyle = new Style({ font: "semibold 20px Open Sans", color: "#1d4ed8", horizontal: "center", vertical: "middle" });
const hintStyle = new Style({ font: "18px Open Sans", color: "#475569", horizontal: "center", vertical: "middle" });

Promise.resolve().then(() => {
	assert.notSameValue(appSkin, null, "skin exists");
	assert.notSameValue(panelSkin, null, "skin exists");
	assert.notSameValue(buttonSkin, null, "skin exists");
	assert.notSameValue(trackSkin, null, "skin exists");
	assert.notSameValue(dotSkin, null, "skin exists");
	assert.notSameValue(titleStyle, null, "style exists");
	assert.notSameValue(valueStyle, null, "style exists");
	assert.notSameValue(buttonStyle, null, "style exists");
	assert.notSameValue(hintStyle, null, "style exists");
}).then($DONE, $DONE);
