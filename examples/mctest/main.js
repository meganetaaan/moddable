import {} from "piu/MC";
import { test, expect, run } from "harness";
import defineBasicTests from "basic";

const WhiteSkin = Skin.template({ fill: "white" });
const TextStyle = Style.template({ font: "20px Open Sans", color: "black", horizontal: "center", vertical: "middle" });

const data = {};
const app = new Application(data, {
	Skin: WhiteSkin,
	contents: [
		Label(data, { anchor: "label", left: 0, right: 0, top: 0, bottom: 0, string: "mctest", Style: TextStyle }),
	],
});

defineBasicTests({ test, expect });

test("piu application exists", () => {
	expect(application.width).toBeGreaterThan(0);
	expect(application.height).toBeGreaterThan(0);
});

test("label text", () => {
	expect(data.label.string).toBe("mctest");
});

run({ name: "mctest/mcsim" });

export default app;
