import {} from "piu/MC";
import Timer from "timer";

import { batch, createComputed, createSignal } from "signal";
import { createRef } from "ref";
import { easings, tweenSignal, type Scheduler } from "animation";
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
const statusRef = createRef<unknown>();

const counterText = createComputed(() => `Count: ${count.value}`);
const hintText = createComputed(() => {
	if (count.value === 0)
		return "Tap the button to start";
	if ((count.value % 5) === 0)
		return "Milestone reached";
	return "Keep tapping";
});
const dotX = createComputed(() => Math.round(progress.value * 188));

const scheduler: Scheduler = {
	now: (): number => Date.now(),
	every: (intervalMs: number, callback: () => void): unknown => Timer.repeat(callback, intervalMs),
	clear: (handle: unknown): void => {
		Timer.clear(handle as Parameters<typeof Timer.clear>[0]);
	},
};

const taskQueue = {
	post(task: () => void): void {
		Timer.set(task, 0);
	},
};

let runningTween: { stop(): void } | null = null;

function startPulse(): void {
	runningTween?.stop();
	runningTween = tweenSignal(progress, {
		from: 0,
		to: 1,
		duration: 600,
		easing: easings.easeInOutQuad,
		scheduler,
		onComplete: (): void => {
			progress.set(0);
		},
	});
}

function increment(): void {
	batch(() => {
		count.update((value) => value + 1);
		startPulse();
	});
}

const mounted = mountPiuApplication(() =>
	node(
		"application",
		{ skin: appSkin },
		node(
			"column",
			{ left: 24, right: 24, top: 20, bottom: 20, skin: panelSkin },
			node("label", { left: 0, right: 0, top: 18, height: 40, style: titleStyle }, "piu-next"),
			node("label", { ref: statusRef, left: 0, right: 0, top: 4, height: 52, style: valueStyle }, counterText.value),
			node(
				"row",
				{ left: 24, right: 24, top: 10, height: 48, active: true, skin: buttonSkin, onTap: increment },
				node("label", { left: 0, right: 0, top: 0, bottom: 0, style: buttonStyle }, "Tap to Increment"),
			),
			node("label", { left: 0, right: 0, top: 8, height: 30, style: hintStyle }, hintText.value),
			node(
				"container",
				{ left: 24, right: 24, top: 12, height: 24, skin: trackSkin },
				node("content", { left: dotX.value, top: 2, width: 24, height: 20, skin: dotSkin }),
			),
		),
	),
	{ taskQueue }
);

(globalThis as unknown as { application: unknown }).application = mounted.application;
trace("piu-next counter-app started\n");
