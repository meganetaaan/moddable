/*---
description:
flags: [module]
---*/

import {
	bootGuardGetPersistedCount,
	bootGuardNextCount,
	bootGuardSetPersistedCount,
	bootGuardShouldEnterSafeMode,
} from "../../../contributed/modclaw/modules/bootGuard.js";

class Store {
	constructor(seed = {}) {
		this.values = new Map(Object.entries(seed));
		this.failNextSet = false;
	}
	get(key) {
		return this.values.get(key);
	}
	set(key, value) {
		if (this.failNextSet) {
			this.failNextSet = false;
			throw new Error("persist failed");
		}
		this.values.set(key, value);
	}
}

assert.sameValue(1, bootGuardNextCount(0));
assert.sameValue(3, bootGuardNextCount(2));
assert.sameValue(1, bootGuardNextCount(-10));

assert.sameValue(false, bootGuardShouldEnterSafeMode(0, 3));
assert.sameValue(false, bootGuardShouldEnterSafeMode(1, 3));
assert.sameValue(true, bootGuardShouldEnterSafeMode(2, 3));
assert.sameValue(true, bootGuardShouldEnterSafeMode(3, 3));
assert.sameValue(false, bootGuardShouldEnterSafeMode(0, 0));

let store = new Store;
assert.sameValue(0, bootGuardGetPersistedCount(store));
assert.sameValue(true, bootGuardSetPersistedCount(store, 3));
assert.sameValue(3, bootGuardGetPersistedCount(store));
store.failNextSet = true;
assert.sameValue(false, bootGuardSetPersistedCount(store, 0));
assert.sameValue(3, bootGuardGetPersistedCount(store));

store = new Store({boot_count: "not-a-number"});
assert.sameValue(0, bootGuardGetPersistedCount(store));
store = new Store({boot_count: "-5"});
assert.sameValue(0, bootGuardGetPersistedCount(store));
store = new Store({boot_count: "999999999999999999999"});
assert.sameValue(0, bootGuardGetPersistedCount(store));
store = new Store({boot_count: "12"});
assert.sameValue(12, bootGuardGetPersistedCount(store));
