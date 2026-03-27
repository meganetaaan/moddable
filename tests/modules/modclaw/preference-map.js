/*---
description:
flags: [module]
---*/

import {PreferenceMap} from "../../../contributed/modclaw/modules/preferenceMap.js";

class FakePreference {
	constructor() {
		this.domains = new Map;
	}

	#domain(name) {
		if (!this.domains.has(name))
			this.domains.set(name, new Map);
		return this.domains.get(name);
	}

	set(domain, key, value) {
		this.#domain(domain).set(key, value);
	}

	get(domain, key) {
		return this.#domain(domain).get(key);
	}

	delete(domain, key) {
		this.#domain(domain).delete(key);
	}

	keys(domain) {
		return Array.from(this.#domain(domain).keys()).sort();
	}
}

const preference = new FakePreference;
const store = new PreferenceMap({preference, domain: "zclaw", prefix: "raw:"});

assert.sameValue(store.has("missing"), false);
assert.sameValue(store.get("missing"), undefined);

store.set("alpha", "one");
store.set("beta", "two");
assert.sameValue(store.get("alpha"), "one");
assert.sameValue(store.has("beta"), true);
assert.sameValue(store.keys().join(","), "alpha,beta");

store.delete("alpha");
assert.sameValue(store.get("alpha"), undefined);
assert.sameValue(store.keys().join(","), "beta");

store.clear();
assert.sameValue(store.keys().length, 0);

const sibling = new PreferenceMap({preference, domain: "zclaw", prefix: "other:"});
sibling.set("gamma", "three");
store.set("delta", "four");
assert.sameValue(store.keys().join(","), "delta");
assert.sameValue(sibling.keys().join(","), "gamma");
