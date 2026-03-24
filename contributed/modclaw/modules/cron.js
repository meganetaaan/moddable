import {
	CRON_MAX_ACTION_LENGTH,
	CRON_MAX_ENTRIES,
	DEFAULT_TIMEZONE,
	TIMEZONE_ALIASES,
	TIMEZONE_MAX_LENGTH,
} from "./config.js";

const TYPE_PERIODIC = "periodic";
const TYPE_DAILY = "daily";
const TYPE_ONCE = "once";

function offsetToMilliseconds(offsetMinutes) {
	return offsetMinutes * 60 * 1000;
}

function localDate(timestamp, offsetMinutes) {
	return new Date(timestamp + offsetToMilliseconds(offsetMinutes));
}

function buildTimestampFromLocal(year, month, day, hour, minute, offsetMinutes) {
	return Date.UTC(year, month, day, hour, minute, 0, 0) - offsetToMilliseconds(offsetMinutes);
}

function advancePeriodic(entry, now) {
	const intervalMs = entry.intervalMinutes * 60 * 1000;
	const drift = now - entry.nextRunAt;
	const steps = Math.floor(Math.max(0, drift) / intervalMs) + 1;
	entry.nextRunAt += steps * intervalMs;
}

function nextDailyRun(now, hour, minute, offsetMinutes) {
	const local = localDate(now, offsetMinutes);
	let candidate = buildTimestampFromLocal(
		local.getUTCFullYear(),
		local.getUTCMonth(),
		local.getUTCDate(),
		hour,
		minute,
		offsetMinutes
	);
	if (candidate <= now) {
		candidate = buildTimestampFromLocal(
			local.getUTCFullYear(),
			local.getUTCMonth(),
			local.getUTCDate() + 1,
			hour,
			minute,
			offsetMinutes
		);
	}
	return candidate;
}

function cloneEntry(entry) {
	return {...entry};
}

export function validatePeriodicInterval(intervalMinutes) {
	return Number.isInteger(intervalMinutes) && (intervalMinutes >= 1) && (intervalMinutes <= 1440);
}

export function validateDailyTime(hour, minute) {
	return Number.isInteger(hour) && Number.isInteger(minute) &&
		(hour >= 0) && (hour <= 23) &&
		(minute >= 0) && (minute <= 59);
}

export function nextEntryId(usedIds = []) {
	const taken = new Set(usedIds.filter(id => Number.isInteger(id) && id > 0));
	for (let id = 1; id <= 255; id += 1) {
		if (!taken.has(id))
			return id;
	}
	return 0;
}

export function trimAsciiWhitespace(value) {
	if ("string" !== typeof value)
		return "";
	let start = 0;
	let end = value.length;
	while ((start < end) && ((value[start] === " ") || (value[start] === "\t") || (value[start] === "\r") || (value[start] === "\n")))
		start += 1;
	while ((end > start) && ((value[end - 1] === " ") || (value[end - 1] === "\t") || (value[end - 1] === "\r") || (value[end - 1] === "\n")))
		end -= 1;
	return value.slice(start, end);
}

export function resolveTimezoneToPosix(timezoneInput) {
	const trimmed = trimAsciiWhitespace(timezoneInput);

	if (!trimmed)
		return {ok: false, error: "Error: timezone must be non-empty"};
	if (trimmed.length >= TIMEZONE_MAX_LENGTH)
		return {ok: false, error: `Error: string too long (max ${TIMEZONE_MAX_LENGTH - 1} chars)`};

	for (let i = 0; i < trimmed.length; i += 1) {
		const code = trimmed.charCodeAt(i);
		if ((code < 0x20) || (code === 0x7f))
			return {ok: false, error: "Error: invalid character in input"};
	}

	for (const [alias, posix] of Object.entries(TIMEZONE_ALIASES)) {
		if (alias.toLowerCase() === trimmed.toLowerCase())
			return {ok: true, timezonePosix: posix};
	}

	if (trimmed.includes("/") && !trimmed.includes(",")) {
		return {
			ok: false,
			error: "Error: timezone name not recognized. Use UTC, America/Los_Angeles, America/Denver, America/Chicago, America/New_York, or a POSIX TZ string.",
		};
	}

	if ((trimmed.indexOf(" ") >= 0) || (trimmed.indexOf("\t") >= 0))
		return {ok: false, error: "Error: timezone must not contain spaces"};

	return {ok: true, timezonePosix: trimmed};
}

export class CronScheduler {
	constructor(options = {}) {
		this.now = options.now ?? (() => Date.now());
		this.maxEntries = options.maxEntries ?? CRON_MAX_ENTRIES;
		this.maxActionLength = options.maxActionLength ?? CRON_MAX_ACTION_LENGTH;
		this.entries = [];
		this.timezone = {...DEFAULT_TIMEZONE, ...(options.timezone ?? {})};
	}

	setTimezone(timezone) {
		this.timezone = {...this.timezone, ...timezone};
	}

	create(spec) {
		if (!spec || ("string" !== typeof spec.action) || !spec.action)
			throw new TypeError("action is required");
		if (spec.action.length > this.maxActionLength)
			throw new RangeError(`action too long (max ${this.maxActionLength})`);
		if (this.entries.length >= this.maxEntries)
			throw new RangeError("no free schedule slots");

		const usedIds = this.entries.map(entry => entry.id);
		const id = nextEntryId(usedIds);
		if (!id)
			throw new RangeError("no free schedule ids");

		const createdAt = this.now();
		const entry = {
			id,
			type: spec.type,
			action: spec.action,
			createdAt,
		};

		switch (spec.type) {
			case TYPE_PERIODIC:
				if (!validatePeriodicInterval(spec.intervalMinutes))
					throw new RangeError("interval_minutes must be 1-1440");
				entry.intervalMinutes = spec.intervalMinutes;
				entry.nextRunAt = createdAt + (spec.intervalMinutes * 60 * 1000);
				break;
			case TYPE_ONCE:
				if (!validatePeriodicInterval(spec.delayMinutes))
					throw new RangeError("delay_minutes must be 1-1440");
				entry.delayMinutes = spec.delayMinutes;
				entry.nextRunAt = createdAt + (spec.delayMinutes * 60 * 1000);
				break;
			case TYPE_DAILY:
				if (!validateDailyTime(spec.hour, spec.minute ?? 0))
					throw new RangeError("daily time must be hour 0-23 and minute 0-59");
				entry.hour = spec.hour;
				entry.minute = spec.minute ?? 0;
				entry.nextRunAt = nextDailyRun(createdAt, entry.hour, entry.minute, this.timezone.offsetMinutes);
				break;
			default:
				throw new RangeError("type must be 'periodic', 'daily', or 'once'");
		}

		this.entries.push(entry);
		return id;
	}

	list() {
		return this.entries
			.slice()
			.sort((left, right) => left.id - right.id)
			.map(cloneEntry);
	}

	delete(id) {
		const index = this.entries.findIndex(entry => entry.id === id);
		if (index < 0)
			return false;
		this.entries.splice(index, 1);
		return true;
	}

	collectDue(now = this.now()) {
		const due = [];
		for (let i = this.entries.length - 1; i >= 0; i -= 1) {
			const entry = this.entries[i];
			if (entry.nextRunAt > now)
				continue;

			due.push({id: entry.id, action: entry.action, type: entry.type});

			if (entry.type === TYPE_ONCE) {
				this.entries.splice(i, 1);
				continue;
			}
			if (entry.type === TYPE_PERIODIC) {
				advancePeriodic(entry, now);
				continue;
			}

			entry.nextRunAt = nextDailyRun(now + 1000, entry.hour, entry.minute, this.timezone.offsetMinutes);
		}

		return due.reverse();
	}
}
