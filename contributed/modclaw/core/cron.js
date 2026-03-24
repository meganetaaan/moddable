import {
	CRON_MAX_ACTION_LEN,
	CRON_MAX_ENTRIES,
	DEFAULT_TIMEZONE_POSIX,
	TIMEZONE_MAX_LEN,
} from "./config.js";

export const CRON_TYPES = Object.freeze({
	PERIODIC: "periodic",
	DAILY: "daily",
	ONCE: "once",
});

const TZ_ALIASES = Object.freeze({
	UTC: "UTC0",
	"Etc/UTC": "UTC0",
	GMT: "UTC0",
	"America/Los_Angeles": "PST8PDT,M3.2.0/2,M11.1.0/2",
	"US/Pacific": "PST8PDT,M3.2.0/2,M11.1.0/2",
	PST: "PST8PDT,M3.2.0/2,M11.1.0/2",
	PDT: "PST8PDT,M3.2.0/2,M11.1.0/2",
	PT: "PST8PDT,M3.2.0/2,M11.1.0/2",
	"America/Denver": "MST7MDT,M3.2.0/2,M11.1.0/2",
	"US/Mountain": "MST7MDT,M3.2.0/2,M11.1.0/2",
	MST: "MST7MDT,M3.2.0/2,M11.1.0/2",
	MDT: "MST7MDT,M3.2.0/2,M11.1.0/2",
	MT: "MST7MDT,M3.2.0/2,M11.1.0/2",
	"America/Chicago": "CST6CDT,M3.2.0/2,M11.1.0/2",
	"US/Central": "CST6CDT,M3.2.0/2,M11.1.0/2",
	CST: "CST6CDT,M3.2.0/2,M11.1.0/2",
	CDT: "CST6CDT,M3.2.0/2,M11.1.0/2",
	CT: "CST6CDT,M3.2.0/2,M11.1.0/2",
	"America/New_York": "EST5EDT,M3.2.0/2,M11.1.0/2",
	"US/Eastern": "EST5EDT,M3.2.0/2,M11.1.0/2",
	EST: "EST5EDT,M3.2.0/2,M11.1.0/2",
	EDT: "EST5EDT,M3.2.0/2,M11.1.0/2",
	ET: "EST5EDT,M3.2.0/2,M11.1.0/2",
});

function trimAsciiWhitespace(value) {
	return String(value ?? "").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

function isPrintableAscii(value) {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code < 0x20 || 0x7f === code)
			return false;
	}
	return true;
}

function isNonEmptyAction(action) {
	return "string" === typeof action && action.length > 0 && action.length < CRON_MAX_ACTION_LEN;
}

export function validatePeriodicInterval(intervalMinutes) {
	return Number.isInteger(intervalMinutes) && intervalMinutes >= 1 && intervalMinutes <= 1440;
}

export function validateDailyTime(hour, minute) {
	return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function nextEntryId(usedIds) {
	const taken = new Set((usedIds ?? []).filter(id => Number.isInteger(id) && id > 0));
	for (let id = 1; id <= 255; id++) {
		if (!taken.has(id))
			return id;
	}
	return 0;
}

export function resolveTimezoneToPosix(timezoneInput) {
	const trimmed = trimAsciiWhitespace(timezoneInput);
	if (!trimmed)
		return {ok: false, error: "Error: timezone must be non-empty"};
	if (trimmed.length >= TIMEZONE_MAX_LEN || !isPrintableAscii(trimmed))
		return {ok: false, error: `Error: value must be 1-${TIMEZONE_MAX_LEN - 1} printable characters`};

	for (const [alias, posix] of Object.entries(TZ_ALIASES)) {
		if (trimmed.toLowerCase() === alias.toLowerCase())
			return {ok: true, value: posix};
	}

	if (trimmed.includes("/") && !trimmed.includes(",")) {
		return {
			ok: false,
			error: "Error: timezone name not recognized. Use UTC, America/Los_Angeles, America/Denver, America/Chicago, America/New_York, or a POSIX TZ string.",
		};
	}

	if (/[ \t]/.test(trimmed))
		return {ok: false, error: "Error: timezone must not contain spaces"};

	return {ok: true, value: trimmed};
}

export function timezoneAbbreviationFromPosix(timezonePosix) {
	const source = String(timezonePosix ?? DEFAULT_TIMEZONE_POSIX);
	const match = source.match(/^[A-Za-z]+/);
	return match ? match[0] : "UTC";
}

export function utcTimePartsFromMillis(nowMs) {
	const date = new Date(nowMs);
	return {
		hour: date.getUTCHours(),
		minute: date.getUTCMinutes(),
		second: date.getUTCSeconds(),
	};
}

export class CronScheduler {
	constructor(options = {}) {
		this.maxEntries = options.maxEntries ?? CRON_MAX_ENTRIES;
		this.timeZone = options.timeZone ?? DEFAULT_TIMEZONE_POSIX;
		this.timeSynced = Boolean(options.timeSynced);
		this.timePartsFromMillis = options.timePartsFromMillis ?? utcTimePartsFromMillis;
		this.entries = [];
	}

	setTimeSynced(value) {
		this.timeSynced = Boolean(value);
	}

	getTimezone() {
		return this.timeZone;
	}

	getTimezoneAbbrev() {
		return timezoneAbbreviationFromPosix(this.timeZone);
	}

	setTimezone(input) {
		const resolved = resolveTimezoneToPosix(input);
		if (!resolved.ok)
			return resolved;
		this.timeZone = resolved.value;
		return {ok: true, value: this.timeZone};
	}

	create(definition, nowMs = Date.now()) {
		const action = definition?.action;
		if (!isNonEmptyAction(action))
			return 0;

		let type = definition?.type;
		let intervalMinutes = 0;
		let hour = 0;
		let minute = 0;

		switch (type) {
			case CRON_TYPES.PERIODIC:
				intervalMinutes = definition.intervalMinutes;
				if (!validatePeriodicInterval(intervalMinutes))
					return 0;
				break;
			case CRON_TYPES.ONCE:
				intervalMinutes = definition.delayMinutes;
				if (!validatePeriodicInterval(intervalMinutes))
					return 0;
				break;
			case CRON_TYPES.DAILY:
				hour = definition.hour;
				minute = definition.minute ?? 0;
				if (!validateDailyTime(hour, minute))
					return 0;
				break;
			default:
				return 0;
		}

		if (this.entries.length >= this.maxEntries)
			return 0;

		const id = nextEntryId(this.entries.map(entry => entry.id));
		if (!id)
			return 0;

		const entry = {
			id,
			type,
			intervalMinutes: intervalMinutes || 0,
			hour: hour || 0,
			minute: minute || 0,
			action,
			lastRun: 0,
			enabled: true,
		};

		if (CRON_TYPES.ONCE === type)
			entry.lastRun = Math.max(0, Math.floor(nowMs / 1000));

		this.entries.push(entry);
		return id;
	}

	list() {
		const timezone = this.getTimezone();
		const timezoneAbbrev = this.getTimezoneAbbrev();
		return this.entries.map(entry => {
			const listed = {
				id: entry.id,
				type: entry.type,
				action: entry.action,
				enabled: entry.enabled,
				timezone,
				timezone_abbrev: timezoneAbbrev,
			};
			if (CRON_TYPES.PERIODIC === entry.type)
				listed.interval_minutes = entry.intervalMinutes;
			else if (CRON_TYPES.ONCE === entry.type)
				listed.delay_minutes = entry.intervalMinutes;
			else
				listed.time = `${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}`;
			return listed;
		});
	}

	delete(id) {
		const index = this.entries.findIndex(entry => entry.id === id);
		if (index < 0)
			return false;
		this.entries.splice(index, 1);
		return true;
	}

	checkDue(nowMs = Date.now()) {
		const nowSeconds = Math.floor(nowMs / 1000);
		const timeParts = this.timePartsFromMillis(nowMs, this.timeZone);
		const minuteStart = nowSeconds - (timeParts.second ?? 0);
		const fired = [];

		for (let index = this.entries.length - 1; index >= 0; index--) {
			const entry = this.entries[index];
			if (!entry.enabled)
				continue;

			let shouldFire = false;
			if (CRON_TYPES.PERIODIC === entry.type) {
				shouldFire = (nowSeconds - entry.lastRun) >= (entry.intervalMinutes * 60);
			}
			else if (CRON_TYPES.ONCE === entry.type) {
				const createdAt = entry.lastRun;
				shouldFire = nowSeconds >= createdAt && (nowSeconds - createdAt) >= (entry.intervalMinutes * 60);
			}
			else if (CRON_TYPES.DAILY === entry.type && this.timeSynced) {
				shouldFire = timeParts.hour === entry.hour && timeParts.minute === entry.minute && entry.lastRun < minuteStart;
			}

			if (!shouldFire)
				continue;

			fired.push({id: entry.id, action: entry.action, type: entry.type});
			if (CRON_TYPES.ONCE === entry.type)
				this.entries.splice(index, 1);
			else
				entry.lastRun = nowSeconds;
		}

		fired.reverse();
		return fired;
	}
}
