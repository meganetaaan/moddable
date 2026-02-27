import test from "node:test";
import assert from "node:assert/strict";

import { createSignal, setNativeTweenDriver, tweenSignal } from "../dist/index.js";

function createFakeScheduler() {
	let now = 0;
	let nextId = 1;
	const callbacks = new Map();
	return {
		now: () => now,
		every(_intervalMs, callback) {
			const id = nextId++;
			callbacks.set(id, callback);
			return id;
		},
		clear(handle) {
			callbacks.delete(handle);
		},
		advance(ms) {
			now += ms;
			for (const callback of [...callbacks.values()])
				callback();
		},
	};
}

test("tweenSignal moves value over time and completes", () => {
	const scheduler = createFakeScheduler();
	const value = createSignal(0);
	let completed = 0;

	tweenSignal(value, {
		from: 0,
		to: 100,
		duration: 1000,
		scheduler,
		onComplete: () => {
			completed += 1;
		},
	});

	assert.equal(value.value, 0);
	scheduler.advance(500);
	assert.equal(value.value, 50);
	scheduler.advance(500);
	assert.equal(value.value, 100);
	assert.equal(completed, 1);
});

test("tweenSignal can be stopped", () => {
	const scheduler = createFakeScheduler();
	const value = createSignal(0);

	const handle = tweenSignal(value, {
		to: 1,
		duration: 1000,
		scheduler,
	});

	scheduler.advance(200);
	const snapshot = value.value;
	handle.stop();
	scheduler.advance(800);
	assert.equal(value.value, snapshot);
});

test("tweenSignal prefers native driver when available", () => {
	const value = createSignal(0);
	let started = 0;
	let stopped = 0;

	setNativeTweenDriver({
		start(context) {
			started += 1;
			context.signal.set(context.to);
			context.onComplete?.();
			return {
				stop() {
					stopped += 1;
				},
			};
		},
	});

	try {
		const handle = tweenSignal(value, {
			to: 42,
			duration: 1000,
		});

		assert.equal(started, 1);
		assert.equal(value.value, 42);
		handle.stop();
		assert.equal(stopped, 1);
	}
	finally {
		setNativeTweenDriver(null);
	}
});
