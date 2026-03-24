import {
	CRON_MAX_ACTION_LEN,
	CRON_MAX_ENTRIES,
	DEFAULT_TIMEZONE_POSIX,
	MAX_DYNAMIC_TOOLS,
} from "../core/config.js";
import {
	CRON_TYPES,
	CronScheduler,
	resolveTimezoneToPosix,
	validateDailyTime,
	validatePeriodicInterval,
} from "../core/cron.js";
import {NVS_KEYS} from "../core/nvsKeys.js";
import {UserToolRegistry} from "../core/userTools.js";

const DEFAULT_CRON_STATE_KEY = "cron_state";
const DEFAULT_USER_TOOLS_KEY = "user_tools";

function parseJSON(value, fallback) {
	if ("string" !== typeof value || !value.length)
		return fallback;
	try {
		return JSON.parse(value);
	}
	catch {
		return fallback;
	}
}

function normalizeInteger(value, fallback = 0) {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : fallback;
}

function isNonEmptyAction(action) {
	return "string" === typeof action && action.length > 0 && action.length < CRON_MAX_ACTION_LEN;
}

function sanitizeCronEntries(entries, maxEntries) {
	if (!Array.isArray(entries))
		return [];

	const sanitized = [];
	const usedIds = new Set;
	for (const entry of entries) {
		if (sanitized.length >= maxEntries)
			break;

		const id = normalizeInteger(entry?.id, 0);
		if (!id || usedIds.has(id))
			continue;

		const type = entry?.type;
		const action = String(entry?.action ?? "");
		if (!isNonEmptyAction(action))
			continue;

		const normalized = {
			id,
			type,
			action,
			lastRun: Math.max(0, normalizeInteger(entry?.lastRun, 0)),
			enabled: entry?.enabled !== false,
			intervalMinutes: 0,
			hour: 0,
			minute: 0,
		};

		if (CRON_TYPES.PERIODIC === type || CRON_TYPES.ONCE === type) {
			const intervalMinutes = normalizeInteger(entry?.intervalMinutes, 0);
			if (!validatePeriodicInterval(intervalMinutes))
				continue;
			normalized.intervalMinutes = intervalMinutes;
		}
		else if (CRON_TYPES.DAILY === type) {
			const hour = normalizeInteger(entry?.hour, -1);
			const minute = normalizeInteger(entry?.minute, -1);
			if (!validateDailyTime(hour, minute))
				continue;
			normalized.hour = hour;
			normalized.minute = minute;
		}
		else {
			continue;
		}

		usedIds.add(id);
		sanitized.push(normalized);
	}

	sanitized.sort((left, right) => left.id - right.id);
	return sanitized;
}

function loadCronState(storage, key, maxEntries) {
	const state = parseJSON(storage?.get?.(key), null);
	const timezoneValue = state?.timeZone ?? storage?.get?.(NVS_KEYS.TIMEZONE) ?? DEFAULT_TIMEZONE_POSIX;
	const resolvedTimeZone = resolveTimezoneToPosix(timezoneValue);
	return {
		timeZone: resolvedTimeZone.ok ? resolvedTimeZone.value : DEFAULT_TIMEZONE_POSIX,
		timeSynced: Boolean(state?.timeSynced),
		entries: sanitizeCronEntries(state?.entries, maxEntries),
	};
}

function persistCronState(storage, key, scheduler) {
	const state = JSON.stringify({
		timeZone: scheduler.getTimezone(),
		timeSynced: Boolean(scheduler.timeSynced),
		entries: scheduler.entries,
	});
	storage?.set?.(key, state);
	storage?.set?.(NVS_KEYS.TIMEZONE, scheduler.getTimezone());
}

function loadUserTools(storage, key) {
	const tools = parseJSON(storage?.get?.(key), []);
	return Array.isArray(tools) ? tools : [];
}

function persistUserTools(storage, key, registry) {
	storage?.set?.(key, JSON.stringify(registry.getAll(registry.maxTools)));
}

export class PersistentCronScheduler extends CronScheduler {
	constructor(options = {}) {
		const storage = options.storage ?? null;
		const maxEntries = options.maxEntries ?? CRON_MAX_ENTRIES;
		const stateKey = options.stateKey ?? DEFAULT_CRON_STATE_KEY;
		const loaded = loadCronState(storage, stateKey, maxEntries);
		super({
			...options,
			maxEntries,
			timeZone: loaded.timeZone,
			timeSynced: loaded.timeSynced,
		});
		this.storage = storage;
		this.stateKey = stateKey;
		this.entries = loaded.entries;
	}

	#persist() {
		persistCronState(this.storage, this.stateKey, this);
	}

	setTimeSynced(value) {
		super.setTimeSynced(value);
		this.#persist();
	}

	setTimezone(input) {
		const result = super.setTimezone(input);
		if (result.ok)
			this.#persist();
		return result;
	}

	create(definition, nowMs = Date.now()) {
		const id = super.create(definition, nowMs);
		if (id)
			this.#persist();
		return id;
	}

	delete(id) {
		const deleted = super.delete(id);
		if (deleted)
			this.#persist();
		return deleted;
	}
}

export class PersistentUserToolRegistry extends UserToolRegistry {
	constructor(options = {}) {
		const storage = options.storage ?? null;
		const stateKey = options.stateKey ?? DEFAULT_USER_TOOLS_KEY;
		super({
			...options,
			maxTools: options.maxTools ?? MAX_DYNAMIC_TOOLS,
			tools: loadUserTools(storage, stateKey),
		});
		this.storage = storage;
		this.stateKey = stateKey;
	}

	#persist() {
		persistUserTools(this.storage, this.stateKey, this);
	}

	create(name, description, action) {
		const created = super.create(name, description, action);
		if (created)
			this.#persist();
		return created;
	}

	delete(name) {
		const deleted = super.delete(name);
		if (deleted)
			this.#persist();
		return deleted;
	}
}
