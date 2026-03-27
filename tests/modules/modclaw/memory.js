/*---
description:
flags: [module]
---*/

import {
	isSensitiveMemoryKey,
	isUserMemoryKey,
	MemoryStore,
} from "../../../contributed/modclaw/modules/memory.js";

assert.sameValue(true, isUserMemoryKey("u_name"));
assert.sameValue(true, isUserMemoryKey("u_temp1"));
assert.sameValue(false, isUserMemoryKey("name"));
assert.sameValue(false, isUserMemoryKey("wifi_ssid"));

assert.sameValue(true, isSensitiveMemoryKey("api_key"));
assert.sameValue(true, isSensitiveMemoryKey("wifi_ssid"));
assert.sameValue(false, isSensitiveMemoryKey("u_api_key"));

const store = new MemoryStore;

assert.sameValue("Saved: u_name = lobster", store.set("u_name", "lobster"));
assert.sameValue("u_name = lobster", store.get("u_name"));
assert.sameValue("Stored keys: u_name", store.list());
assert.sameValue("Deleted: u_name", store.delete("u_name"));
assert.sameValue("No stored keys", store.list());
assert.sameValue("Key 'u_name' not found", store.get("u_name"));
assert.sameValue("Key not found: u_name", store.delete("u_name"));

assert.throws(Error, () => store.set("name", "lobster"));
assert.throws(Error, () => store.set("wifi_ssid", "secret"));
assert.throws(Error, () => store.set("u_bad-key", "secret"));
