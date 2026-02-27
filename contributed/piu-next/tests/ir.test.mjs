import test from "node:test";
import assert from "node:assert/strict";

import { node } from "../dist/index.js";
import { makeTSXSmokeTree } from "../dist/tsx-smoke.js";

test("node normalizes children into compact renderable nodes", () => {
	const tree = node(
		"screen",
		{ id: "root" },
		"header",
		0,
		false,
		null,
		undefined,
		[node("label", { role: "status" }, "ok")]
	);

	assert.equal(tree.kind, "element");
	assert.equal(tree.children.length, 3);
	assert.deepEqual(
		tree.children.map((child) => child.kind),
		["text", "text", "element"]
	);
	assert.equal(tree.children[0].value, "header");
	assert.equal(tree.children[1].value, "0");
	assert.equal(tree.children[2].type, "label");
});

test("TSX transpiles to the same IR shape without JSX runtime package", () => {
	const tree = makeTSXSmokeTree();
	assert.equal(tree.kind, "element");
	assert.equal(tree.type, "screen");
	assert.equal(tree.children.length, 2);
	assert.equal(tree.children[0].kind, "element");
	assert.equal(tree.children[0].type, "row");
	assert.deepEqual(
		tree.children[0].children.map((child) => child.kind),
		["text", "text"]
	);
	assert.equal(tree.children[1].type, "label");
});
