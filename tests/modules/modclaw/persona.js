/*---
description:
flags: [module]
---*/

import {
	canonicalizePersonaName,
	loadPersona,
	resetPersona,
	setPersona,
} from "../../../contributed/modclaw/modules/persona.js";

class Storage {
	constructor(seed = {}) {
		this.values = new Map(Object.entries(seed));
	}
	read(key) {
		return this.values.get(key);
	}
	write(key, value) {
		this.values.set(key, value);
	}
}

const storage = new Storage;

assert.sameValue(canonicalizePersonaName("Friendly"), "friendly");
assert.sameValue(canonicalizePersonaName("TECHNICAL"), "technical");
assert.sameValue(canonicalizePersonaName("??"), null);

assert.sameValue(loadPersona(storage), "neutral");
assert.sameValue(setPersona(storage, "WITTY"), "witty");
assert.sameValue(loadPersona(storage), "witty");
assert.sameValue(resetPersona(storage), "neutral");
assert.sameValue(loadPersona(storage), "neutral");

storage.write("persona", "BROKEN");
assert.sameValue(loadPersona(storage), "neutral");
assert.throws(RangeError, () => setPersona(storage, "bogus"));
