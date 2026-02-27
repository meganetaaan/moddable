import test from "node:test";
import assert from "node:assert/strict";

import { batch, createComputed, createSignal, effect } from "../dist/index.js";

test("signal notifies subscribers only when value changes", () => {
	const count = createSignal(1);
	let notifications = 0;
	const unsubscribe = count.subscribe(() => {
		notifications += 1;
	});

	count.set(1);
	count.set(2);
	count.update((value) => value + 1);

	assert.equal(count.value, 3);
	assert.equal(notifications, 2);
	unsubscribe();
});

test("computed memoizes and invalidates only when dependencies change", () => {
	const a = createSignal(2);
	const b = createSignal(3);
	let evaluations = 0;
	const sum = createComputed(() => {
		evaluations += 1;
		return a.value + b.value;
	});

	assert.equal(evaluations, 0);
	assert.equal(sum.value, 5);
	assert.equal(evaluations, 1);
	assert.equal(sum.value, 5);
	assert.equal(evaluations, 1);

	a.set(4);
	assert.equal(evaluations, 1);
	assert.equal(sum.value, 7);
	assert.equal(evaluations, 2);
});

test("effect tracks dynamic dependencies", () => {
	const mode = createSignal("a");
	const a = createSignal(10);
	const b = createSignal(20);
	let latest = -1;

	const dispose = effect(() => {
		latest = mode.value === "a" ? a.value : b.value;
	});

	assert.equal(latest, 10);
	a.set(11);
	assert.equal(latest, 11);
	b.set(21);
	assert.equal(latest, 11);
	mode.set("b");
	assert.equal(latest, 21);
	a.set(12);
	assert.equal(latest, 21);
	b.set(22);
	assert.equal(latest, 22);

	dispose();
	b.set(23);
	assert.equal(latest, 22);
});

test("effect handles re-entrant signal updates without stack overflow", () => {
	const value = createSignal(0);
	let runs = 0;

	const dispose = effect(() => {
		runs += 1;
		if (value.value < 2000)
			value.set(value.value + 1);
	});

	assert.equal(value.value, 2000);
	assert.equal(runs, 2001);
	dispose();
});

test("batch coalesces multiple updates into a single effect pass", () => {
	const count = createSignal(0);
	let runs = 0;
	let latest = -1;

	const dispose = effect(() => {
		runs += 1;
		latest = count.value;
	});

	batch(() => {
		count.set(1);
		count.set(2);
		count.set(3);
	});

	assert.equal(latest, 3);
	assert.equal(runs, 2);
	dispose();
});
