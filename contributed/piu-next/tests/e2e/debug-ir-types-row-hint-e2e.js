/*---
description: inspect IR types for row-hint tree.
flags: [module]
---*/
import { node } from "index";

function assertElementTypesNonEmpty(element) {
	assert.sameValue(element.kind, "element", "kind element");
	assert.notSameValue(element.type, "", "type must be non-empty");
	for (const child of element.children) {
		if (child.kind === "element")
			assertElementTypesNonEmpty(child);
	}
}

const root = node("application", {},
	node("column", { left: 24, right: 24, top: 20, bottom: 20 },
		node("label", { left: 0, right: 0, top: 18, height: 40 }, "piu-next"),
		node("label", { left: 0, right: 0, top: 4, height: 52 }, "Count: 0"),
		node("row", { left: 24, right: 24, top: 10, height: 48 }, node("label", { left: 0, right: 0, top: 0, bottom: 0 }, "Tap to Increment")),
		node("label", { left: 0, right: 0, top: 8, height: 30 }, "Tap the button to start"),
	),
);

assertElementTypesNonEmpty(root);
