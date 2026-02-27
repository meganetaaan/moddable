import test from "node:test";
import assert from "node:assert/strict";

import { attachRef, createRef, detachRef } from "../dist/index.js";

test("ref tracks current instance explicitly", () => {
	const ref = createRef();
	assert.equal(ref.current, null);

	const view = { id: "view-1" };
	attachRef(ref, view);
	assert.equal(ref.current, view);

	detachRef(ref);
	assert.equal(ref.current, null);
});

test("detachRef can guard by expected target", () => {
	const ref = createRef();
	const a = { id: "a" };
	const b = { id: "b" };

	attachRef(ref, a);
	detachRef(ref, b);
	assert.equal(ref.current, a);

	detachRef(ref, a);
	assert.equal(ref.current, null);
});
