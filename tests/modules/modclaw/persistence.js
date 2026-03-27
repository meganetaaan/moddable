/*---
description:
flags: [module]
---*/

import {PreferenceMap} from "../../../contributed/modclaw/modules/preferenceMap.js";
import {
	PersistentCronScheduler,
	PersistentUserToolRegistry,
} from "../../../contributed/modclaw/modules/persistence.js";

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
const storage = new PreferenceMap({preference, domain: "zclaw"});

let cron = new PersistentCronScheduler({storage});
assert.sameValue(cron.getTimezone(), "UTC0");
assert.sameValue(cron.list().length, 0);
assert.sameValue(cron.create({type: "periodic", intervalMinutes: 15, action: "blink"}), 1);
assert.sameValue(cron.create({type: "daily", hour: 7, minute: 30, action: "status"}), 2);
assert(cron.setTimezone("America/New_York").ok);
cron.setTimeSynced(true);

cron = new PersistentCronScheduler({storage});
assert.sameValue(cron.getTimezone(), "EST5EDT,M3.2.0/2,M11.1.0/2");
assert.sameValue(cron.list().length, 2);
assert.sameValue(cron.list()[0].interval_minutes, 15);
assert.sameValue(cron.list()[1].time, "07:30");
assert.sameValue(cron.timeSynced, true);
assert.sameValue(cron.delete(1), true);

cron = new PersistentCronScheduler({storage});
assert.sameValue(cron.list().length, 1);
assert.sameValue(cron.list()[0].id, 2);

let userTools = new PersistentUserToolRegistry({storage});
assert.sameValue(userTools.count(), 0);
assert.sameValue(userTools.create("lamp_on", "Turn the lamp on", "gpio_write 2 1"), true);
assert.sameValue(userTools.create("lamp_off", "Turn the lamp off", "gpio_write 2 0"), true);

userTools = new PersistentUserToolRegistry({storage});
assert.sameValue(userTools.count(), 2);
assert.sameValue(userTools.find("lamp_on").action, "gpio_write 2 1");
assert.sameValue(userTools.delete("lamp_on"), true);

userTools = new PersistentUserToolRegistry({storage});
assert.sameValue(userTools.count(), 1);
assert.sameValue(userTools.find("lamp_on"), null);
assert.sameValue(userTools.find("lamp_off").description, "Turn the lamp off");
