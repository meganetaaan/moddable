/*---
description:
flags: [module, async]
---*/

import {HttpGate} from "../../../contributed/modclaw/modules/httpGate.js";

function withResolvers() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {promise, resolve, reject};
}

const gate = new HttpGate;
const order = [];
const hold = withResolvers();

const first = gate.runExclusive("one", {}, async () => {
	order.push("one-start");
	await hold.promise;
	order.push("one-end");
	return 1;
});

const skipped = await gate.runExclusive("skip", {skipIfBusy: true}, async () => 3);
assert.sameValue(skipped.ok, false);
assert.sameValue(skipped.skipped, true);
assert.sameValue(gate.isBusy(), true);

const second = gate.runExclusive("two", {}, async () => {
	order.push("two");
	return 2;
});

hold.resolve();
const firstResult = await first;
const secondResult = await second;

assert.sameValue(firstResult.ok, true);
assert.sameValue(firstResult.value, 1);
assert.sameValue(secondResult.ok, true);
assert.sameValue(secondResult.value, 2);
assert.sameValue(order.join(","), "one-start,one-end,two");
assert.sameValue(gate.isBusy(), false);
