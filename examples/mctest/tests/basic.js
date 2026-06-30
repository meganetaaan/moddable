export default function defineBasicTests({ test, expect }) {
	test("arithmetic", () => {
		expect(1 + 1).toBe(2);
	});

	test("promise microtask", async () => {
		const value = await Promise.resolve("ok");
		expect(value).toBe("ok");
	});

	test("structured data", () => {
		expect({ platform: "xs", mode: "portable" }).toEqual({ platform: "xs", mode: "portable" });
	});
}
