import test from "node:test";
import assert from "node:assert/strict";

import {
	createResource,
	createResourceScope,
	createSkinResource,
	createStyleResource,
} from "../dist/index.js";

test("createResource releases once", () => {
	let disposed = 0;
	const resource = createResource(
		() => ({ id: 1 }),
		() => {
			disposed += 1;
		},
	);

	assert.equal(resource.released, false);
	resource.release();
	resource.release();
	assert.equal(resource.released, true);
	assert.equal(disposed, 1);
});

test("createResourceScope releases owned resources", () => {
	let disposedA = 0;
	let disposedB = 0;
	const scope = createResourceScope();
	const resourceA = scope.own(createResource(() => 1, () => { disposedA += 1; }));
	const resourceB = scope.own(createResource(() => 2, () => { disposedB += 1; }));

	assert.equal(scope.released, false);
	assert.equal(resourceA.released, false);
	assert.equal(resourceB.released, false);

	scope.releaseAll();
	assert.equal(scope.released, true);
	assert.equal(resourceA.released, true);
	assert.equal(resourceB.released, true);
	assert.equal(disposedA, 1);
	assert.equal(disposedB, 1);
});

test("createSkinResource and createStyleResource validate constructors", () => {
	const previousSkin = globalThis.Skin;
	const previousStyle = globalThis.Style;
	delete globalThis.Skin;
	delete globalThis.Style;
	assert.throws(() => createSkinResource({ fill: "white" }), /Skin constructor is unavailable/);
	assert.throws(() => createStyleResource({ font: "16px Open Sans" }), /Style constructor is unavailable/);

	globalThis.Skin = function FakeSkin(dictionary = {}) {
		this.dictionary = dictionary;
	};
	globalThis.Style = function FakeStyle(dictionary = {}) {
		this.dictionary = dictionary;
	};

	const skin = createSkinResource({ fill: "white" });
	const style = createStyleResource({ color: "black" });
	assert.deepEqual(skin.value.dictionary, { fill: "white" });
	assert.deepEqual(style.value.dictionary, { color: "black" });

	if (previousSkin)
		globalThis.Skin = previousSkin;
	else
		delete globalThis.Skin;
	if (previousStyle)
		globalThis.Style = previousStyle;
	else
		delete globalThis.Style;
});
