import test from "node:test";
import assert from "node:assert/strict";

import {
	createBridgeTweenDriver,
	createReferenceRuntimeDriver,
	createSignal,
	installNativeDrivers,
	mountPiuApplication,
	node,
	tweenSignal,
} from "../dist/index.js";

function installFakePiu() {
	const globalScope = globalThis;

	class Behavior {
	}
	globalScope.Behavior = Behavior;

	function linkChildren(container) {
		for (let i = 0; i < container.children.length; i += 1) {
			const child = container.children[i];
			child.container = container;
			child.index = i;
			child.previous = (i > 0) ? container.children[i - 1] : null;
			child.next = (i + 1 < container.children.length) ? container.children[i + 1] : null;
		}
		container.first = container.children[0] ?? null;
		container.last = container.children[container.children.length - 1] ?? null;
		container.length = container.children.length;
	}

	function detachFromParent(content) {
		if (!content?.container)
			return;
		const owner = content.container;
		const index = owner.children.indexOf(content);
		if (index >= 0)
			owner.children.splice(index, 1);
		content.container = null;
		content.previous = null;
		content.next = null;
		content.index = -1;
		linkChildren(owner);
	}

	function attachBehavior(content, dictionary) {
		if (dictionary.Behavior)
			content.behavior = new dictionary.Behavior();
	}

	function makeContainer(kind) {
		return function FakeContainer(_owner, dictionary = {}) {
			this.kind = kind;
			this.children = [];
			this.first = null;
			this.last = null;
			this.length = 0;
			this.container = null;
			this.previous = null;
			this.next = null;
			this.index = -1;
			this.add = (content) => {
				detachFromParent(content);
				this.children.push(content);
				linkChildren(this);
			};
			this.content = (at) => this.children[at];
			this.insert = (content, before) => {
				detachFromParent(content);
				const index = this.children.indexOf(before);
				if (index < 0)
					throw new Error("insert target not found");
				this.children.splice(index, 0, content);
				linkChildren(this);
			};
			this.remove = (content) => {
				const index = this.children.indexOf(content);
				if (index < 0)
					throw new Error("remove target not found");
				this.children.splice(index, 1);
				linkChildren(this);
			};
			this.empty = () => {
				this.children = [];
				linkChildren(this);
			};
			attachBehavior(this, dictionary);
			Object.assign(this, dictionary);
			if (Array.isArray(dictionary.contents)) {
				for (const content of dictionary.contents)
					this.add(content);
			}
		};
	}

	globalScope.Application = makeContainer("application");
	globalScope.Container = makeContainer("container");
	globalScope.Column = makeContainer("column");
	globalScope.Row = makeContainer("row");
	globalScope.Content = makeContainer("content");
	globalScope.Label = function FakeLabel(_owner, dictionary = {}) {
		this.kind = "label";
		this.container = null;
		this.previous = null;
		this.next = null;
		this.index = -1;
		attachBehavior(this, dictionary);
		Object.assign(this, dictionary);
	};
}

test("createReferenceRuntimeDriver can mount and update through driver path", () => {
	installFakePiu();
	const count = createSignal(0);
	const mounted = mountPiuApplication(
		() => node("application", {}, node("label", { string: `Count: ${count.value}` })),
		{ driver: createReferenceRuntimeDriver() }
	);

	assert.equal(mounted.application.first.string, "Count: 0");
	count.set(1);
	assert.equal(mounted.application.first.string, "Count: 1");
	mounted.dispose();
});

test("createBridgeTweenDriver delegates updates to bridge", () => {
	const signal = createSignal(0);
	let completed = 0;
	const driver = createBridgeTweenDriver({
		start(context) {
			context.onUpdate(42);
			context.onComplete?.();
			return {
				stop() {},
			};
		},
	});

	tweenSignal(signal, {
		to: 100,
		duration: 1000,
		driver,
		onComplete: () => {
			completed += 1;
		},
	});

	assert.equal(signal.value, 42);
	assert.equal(completed, 1);
});

test("installNativeDrivers accepts explicit registry", () => {
	installNativeDrivers({ runtime: null, tween: null });
	assert.ok(true);
});
