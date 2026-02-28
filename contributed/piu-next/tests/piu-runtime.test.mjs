import test from "node:test";
import assert from "node:assert/strict";

import { createRef, createSignal, node, mountPiuApplication, setNativeRuntimeDriver } from "../dist/index.js";

function installFakePiu() {
	const globalScope = globalThis;
	const stats = {
		applicationAdds: 0,
		applicationInserts: 0,
		applicationRemoves: 0,
		applicationEmpties: 0,
		labelConstructed: 0,
	};

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
		content.defer = (id, ...extras) => {
			const handler = content.behavior?.[id];
			if (typeof handler === "function")
				handler.call(content.behavior, content, ...extras);
		};
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
				if (kind === "application")
					stats.applicationAdds += 1;
			};
			this.content = (at) => this.children[at];
			this.insert = (content, before) => {
				detachFromParent(content);
				const index = this.children.indexOf(before);
				if (index < 0)
					throw new Error("insert target not found");
				this.children.splice(index, 0, content);
				linkChildren(this);
				if (kind === "application")
					stats.applicationInserts += 1;
			};
			this.remove = (content) => {
				const index = this.children.indexOf(content);
				if (index < 0)
					throw new Error("remove target not found");
				this.children.splice(index, 1);
				content.container = null;
				content.previous = null;
				content.next = null;
				content.index = -1;
				linkChildren(this);
				if (kind === "application")
					stats.applicationRemoves += 1;
			};
			this.replace = (content, by) => {
				detachFromParent(by);
				const index = this.children.indexOf(content);
				if (index < 0)
					throw new Error("replace target not found");
				this.children[index] = by;
				content.container = null;
				content.previous = null;
				content.next = null;
				content.index = -1;
				linkChildren(this);
			};
			this.empty = () => {
				for (const child of this.children) {
					child.container = null;
					child.previous = null;
					child.next = null;
					child.index = -1;
				}
				this.children = [];
				linkChildren(this);
				if (kind === "application")
					stats.applicationEmpties += 1;
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
		this.active = false;
		attachBehavior(this, dictionary);
		Object.assign(this, dictionary);
		stats.labelConstructed += 1;
	};

	return stats;
}

test("mountPiuApplication updates rendered label text when signal changes", () => {
	const stats = installFakePiu();
	const count = createSignal(1);

	const mounted = mountPiuApplication(() =>
		node(
			"application",
			{},
			node("label", { key: "status", left: 10, string: `Count: ${count.value}` })
		)
	);

	assert.equal(mounted.application.first.string, "Count: 1");
	assert.equal(stats.applicationAdds, 1);
	assert.equal(stats.applicationEmpties, 0);
	assert.equal(stats.labelConstructed, 1);

	count.set(2);

	assert.equal(mounted.application.first.string, "Count: 2");
	assert.equal(stats.applicationAdds, 1);
	assert.equal(stats.applicationEmpties, 0);
	assert.equal(stats.labelConstructed, 1);

	mounted.dispose();
});

test("mountPiuApplication reflects keyed child order updates", () => {
	const stats = installFakePiu();
	const flip = createSignal(false);

	const mounted = mountPiuApplication(() => {
		const first = flip.value ? "b" : "a";
		const second = flip.value ? "a" : "b";
		return node(
			"application",
			{},
			node(
				"row",
				{},
				node("label", { key: first, string: first.toUpperCase() }),
				node("label", { key: second, string: second.toUpperCase() }),
			)
		);
	});

	const row = mounted.application.first;
	const labelA = row.first;
	const labelB = row.last;
	assert.equal(row.first.string, "A");
	assert.equal(row.last.string, "B");
	assert.equal(stats.applicationAdds, 1);
	assert.equal(stats.applicationEmpties, 0);
	assert.equal(stats.labelConstructed, 2);

	flip.set(true);

	const nextRow = mounted.application.first;
	assert.equal(nextRow, row);
	assert.equal(nextRow.first.string, "B");
	assert.equal(nextRow.last.string, "A");
	assert.equal(nextRow.first, labelB);
	assert.equal(nextRow.last, labelA);
	assert.equal(stats.applicationAdds, 1);
	assert.equal(stats.applicationEmpties, 0);
	assert.equal(stats.applicationInserts, 0);
	assert.equal(stats.labelConstructed, 2);

	mounted.dispose();
});

test("mountPiuApplication updates refs to the latest rendered node", () => {
	installFakePiu();
	const swap = createSignal(false);
	const refA = createRef();
	const refB = createRef();

	const mounted = mountPiuApplication(() =>
		node(
			"application",
			{},
			node("label", { key: "status", ref: swap.value ? refB : refA, string: "Status" })
		)
	);

	const label = mounted.application.first;
	assert.equal(refA.current, label);
	assert.equal(refB.current, null);

	swap.set(true);
	assert.equal(mounted.application.first, label);
	assert.equal(refA.current, null);
	assert.equal(refB.current, mounted.application.first);

	mounted.dispose();
	assert.equal(refA.current, null);
	assert.equal(refB.current, null);
});

test("mountPiuApplication wires deferred onTap behavior", () => {
	installFakePiu();
	let tapped = 0;

	const mounted = mountPiuApplication(() =>
		node(
			"application",
			{},
			node("label", {
				string: "Tap me",
				onTap: () => {
					tapped += 1;
				},
			})
		),
		{
			taskQueue: {
				post(task) {
					task();
				},
			},
		}
	);

	const label = mounted.application.first;
	const behavior = label.behavior;
	behavior.onTouchEnded(label, 0, 10, 20, 30);

	assert.equal(tapped, 1);
	mounted.dispose();
});

test("mountPiuApplication can delegate updates to runtime driver", () => {
	const stats = installFakePiu();
	const count = createSignal(1);
	const calls = [];
	const app = new globalThis.Application(null, {});
	setNativeRuntimeDriver({
		mount(root, context) {
			calls.push({ phase: "mount", root, context });
			return {
				application: app,
				update(nextRoot) {
					calls.push({ phase: "update", root: nextRoot });
				},
				dispose() {
					calls.push({ phase: "dispose" });
				},
			};
		},
	});
	try {
		const mounted = mountPiuApplication(() =>
			node(
				"application",
				{},
				node("label", { string: `Count: ${count.value}` })
			)
		);

		assert.equal(mounted.application, app);
		assert.equal(stats.labelConstructed, 0);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].phase, "mount");

		count.set(2);
		assert.equal(calls.length, 2);
		assert.equal(calls[1].phase, "update");
		assert.equal(calls[1].root.children[0].props.string, "Count: 2");

		mounted.dispose();
		assert.equal(calls.length, 3);
		assert.equal(calls[2].phase, "dispose");
	}
	finally {
		setNativeRuntimeDriver(null);
	}
});
