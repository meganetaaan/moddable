import {
	RATELIMIT_ENABLED,
	RATELIMIT_MAX_PER_DAY,
	RATELIMIT_MAX_PER_HOUR,
} from "./config.js";
import {NVS_KEYS} from "./nvsKeys.js";

function parseIntegerOrDefault(value, fallback) {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : fallback;
}

function storeGet(store, key) {
	if (!store || ("function" !== typeof store.get))
		return undefined;
	return store.get(key);
}

function storeSet(store, key, value) {
	if (!store || ("function" !== typeof store.set))
		return false;
	store.set(key, value);
	return true;
}

function utcDayOfYear(date) {
	const start = Date.UTC(date.getUTCFullYear(), 0, 1);
	const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	return Math.floor((current - start) / 86400000);
}

export class RateLimiter {
	constructor(options = {}) {
		this.store = options.store ?? null;
		this.now = options.now ?? (() => new Date());
		this.enabled = options.enabled ?? RATELIMIT_ENABLED;
		this.maxPerHour = options.maxPerHour ?? RATELIMIT_MAX_PER_HOUR;
		this.maxPerDay = options.maxPerDay ?? RATELIMIT_MAX_PER_DAY;
		this.requestsThisHour = 0;
		this.requestsToday = 0;
		this.lastHour = -1;
		this.lastDay = -1;
		this.lastYear = -1;
		this.persistFailureCount = 0;
	}

	#persist(key, value) {
		try {
			if (!storeSet(this.store, key, value))
				this.persistFailureCount++;
		}
		catch {
			this.persistFailureCount++;
		}
	}

	#updateTimeWindow() {
		const now = this.now();
		const currentHour = now.getUTCHours();
		const currentDay = utcDayOfYear(now);
		const currentYear = now.getUTCFullYear();

		if (currentHour !== this.lastHour) {
			this.requestsThisHour = 0;
			this.lastHour = currentHour;
		}

		if ((currentDay !== this.lastDay) || (currentYear !== this.lastYear)) {
			this.requestsToday = 0;
			this.lastDay = currentDay;
			this.lastYear = currentYear;
			this.#persist(NVS_KEYS.RL_DAY, String(currentDay));
			this.#persist(NVS_KEYS.RL_YEAR, String(currentYear));
			this.#persist(NVS_KEYS.RL_DAILY, "0");
		}
	}

	init() {
		this.persistFailureCount = 0;
		this.requestsToday = parseIntegerOrDefault(storeGet(this.store, NVS_KEYS.RL_DAILY), 0);
		this.lastDay = parseIntegerOrDefault(storeGet(this.store, NVS_KEYS.RL_DAY), -1);
		this.lastYear = parseIntegerOrDefault(storeGet(this.store, NVS_KEYS.RL_YEAR), -1);
	}

	check() {
		if (!this.enabled)
			return {ok: true, reason: ""};

		this.#updateTimeWindow();

		if (this.requestsThisHour >= this.maxPerHour) {
			return {
				ok: false,
				reason: `Rate limited: ${this.requestsThisHour}/${this.maxPerHour} requests this hour. Try again later.`,
			};
		}

		if (this.requestsToday >= this.maxPerDay) {
			return {
				ok: false,
				reason: `Daily limit reached: ${this.requestsToday}/${this.maxPerDay} requests today. Resets at midnight.`,
			};
		}

		return {ok: true, reason: ""};
	}

	recordRequest() {
		this.#updateTimeWindow();
		this.requestsThisHour++;
		this.requestsToday++;
		this.#persist(NVS_KEYS.RL_DAILY, String(this.requestsToday));
	}

	getRequestsToday() {
		return this.requestsToday;
	}

	getRequestsThisHour() {
		return this.requestsThisHour;
	}

	resetDaily() {
		this.requestsToday = 0;
		this.requestsThisHour = 0;
		this.#persist(NVS_KEYS.RL_DAILY, "0");
	}

	getPersistFailureCount() {
		return this.persistFailureCount;
	}
}
