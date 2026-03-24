/*---
description:
flags: [module]
---*/

import {RateLimiter} from "../../../contributed/zclaw/modules/rateLimit.js";

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

const now = new Date("2026-03-18T12:00:00Z");
const dayStart = Date.UTC(now.getUTCFullYear(), 0, 1);
const currentDay = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dayStart) / 86400000);
const store = new Store({
	rl_day: String(currentDay),
	rl_year: String(now.getUTCFullYear()),
	rl_daily: "0",
});
const limiter = new RateLimiter({
	store,
	now() {
		return new Date(now.valueOf());
	},
});

limiter.init();
assert.sameValue(0, limiter.getPersistFailureCount());

store.failNextSet = true;
limiter.recordRequest();
assert.sameValue(1, limiter.getPersistFailureCount());

limiter.recordRequest();
assert.sameValue("2", store.get("rl_daily"));

const denied = new RateLimiter({
	store: new Store({
		rl_day: String(currentDay),
		rl_year: String(now.getUTCFullYear()),
		rl_daily: "1",
	}),
	maxPerHour: 1,
	maxPerDay: 1,
	now() {
		return new Date(now.valueOf());
	},
});
denied.init();
denied.recordRequest();
const check = denied.check();
assert.sameValue(false, check.ok);
assert(check.reason.includes("hour"));

denied.resetDaily();
assert.sameValue(0, denied.getRequestsToday());
