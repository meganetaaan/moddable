import {} from "piu/MC";
import Timer from "timer";
import "runtimeBridge";
import { createSignal, installNativeDriversFromGlobals, mountPiuApplication, node } from "index";

globalThis.__piuNextEnableNativeRuntimeBridge = true;
installNativeDriversFromGlobals();

const count = createSignal(0);
const mounted = mountPiuApplication(() =>
	node(
		"application",
		{},
		node("label", { string: `Count: ${count.value}` }),
	)
);

globalThis.application = mounted.application;
trace("native-runtime-smoke mounted\n");

Timer.set(() => {
	count.set(1);
	trace("native-runtime-smoke updated\n");
}, 250);
