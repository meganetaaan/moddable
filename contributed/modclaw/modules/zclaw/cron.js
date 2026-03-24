import {DEFAULT_TIMEZONE_POSIX, LIMITS} from "./constants.js";
import {abbreviateTimezone, normalizeTimezone} from "./timezone.js";
import {validateStringInput} from "./validate.js";

const MINUTE_MS = 60_000;

function copyDate(date) {
	return new Date(date.valueOf());
}

function parseUTCOffsetMinutes(posix) {
	const match = String(posix).match(/^([A-Za-z]+)([0-9]{1,2})(?:([A-Za-z]+).*)?$/);
	if (!match)
		return 0;
	return Number(match[2]) * 60;
}

function toLocalDateParts(date, posix) {
	const offsetMinutes = parseUTCOffsetMinutes(posix);
	const localMs = date.valueOf() - (offsetMinutes * MINUTE_MS);
	const local = new Date(localMs);
	return {
		year: local.getUTCFullYear(),
		month: local.getUTCMonth(),
		day: local.getUTCDate(),
	};
}

function fromLocalDateParts(parts, posix) {
	const offsetMinutes = parseUTCOffsetMinutes(posix);
	const utcMs = Date.UTC(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second ?? 0, parts.millisecond ?? 0);
	return new Date(utcMs + (offsetMinutes * MINUTE_MS));
}

export function validatePeriodicInterval(intervalMinutes) {
	return Number.isInteger(intervalMinutes) && (intervalMinutes >= 1) && (intervalMinutes <= 1440);
}

export function validateDailyTime(hour, minute) {
	return Number.isInteger(hour) && Number.isInteger(minute) && (hour >= 0) && (hour <= 23) && (minute >= 0) && (minute <= 59);
}

export function nextEntryID(usedIDs) {
	const taken = new Set((usedIDs ?? []).filter(Boolean));
	for (let id = 1; id <= 255; id++) {
		if (!taken.has(id))
			return id;
	}
	return 0;
}

export function computeNextFireAt(entry, now = new Date(), timeZone = DEFAULT_TIMEZONE_POSIX) {
	switch (entry.type) {
		case "periodic":
			return new Date(now.valueOf() + (entry.intervalMinutes * MINUTE_MS));
		case "once":
			if (entry.fireAt)
				return copyDate(entry.fireAt);
			return new Date(now.valueOf() + (entry.delayMinutes * MINUTE_MS));
		case "daily": {
			const local = toLocalDateParts(now, timeZone);
			let candidate = fromLocalDateParts({
				year: local.year,
				month: local.month,
				day: local.day,
				hour: entry.hour,
				minute: entry.minute,
				second: 0,
				millisecond: 0,
			}, timeZone);
			if (candidate.valueOf() <= now.valueOf()) {
				candidate = fromLocalDateParts({
					year: local.year,
					month: local.month,
					day: local.day + 1,
					hour: entry.hour,
					minute: entry.minute,
					second: 0,
					millisecond: 0,
				}, timeZone);
			}
			return candidate;
		}
		default:
			throw new Error(`Error: unknown schedule type '${entry.type}'`);
	}
}

export class CronScheduler {
	#entries = [];
	#timeZone = DEFAULT_TIMEZONE_POSIX;

	constructor({timeZone = DEFAULT_TIMEZONE_POSIX} = {}) {
		this.#timeZone = normalizeTimezone(timeZone);
	}

	setTimezone(value) {
		this.#timeZone = normalizeTimezone(value);
		return this.#timeZone;
	}

	getTimezone() {
		return this.#timeZone;
	}

	getTimezoneAbbreviation() {
		return abbreviateTimezone(this.#timeZone);
	}

	create(input, now = new Date()) {
		const type = input?.type;
		const action = validateStringInput(input?.action, LIMITS.cronMaxActionLength);
		let entry;

		switch (type) {
			case "periodic":
				if (!validatePeriodicInterval(input.interval_minutes))
					throw new Error("Error: interval_minutes must be 1-1440");
				entry = {
					id: nextEntryID(this.#entries.map(entry => entry.id)),
					type,
					action,
					intervalMinutes: input.interval_minutes,
				};
				break;
			case "daily":
				if (!validateDailyTime(input.hour, input.minute ?? 0))
					throw new Error("Error: daily time must be hour 0-23 and minute 0-59");
				entry = {
					id: nextEntryID(this.#entries.map(entry => entry.id)),
					type,
					action,
					hour: input.hour,
					minute: input.minute ?? 0,
				};
				break;
			case "once":
				if (!validatePeriodicInterval(input.delay_minutes))
					throw new Error("Error: delay_minutes must be 1-1440");
				entry = {
					id: nextEntryID(this.#entries.map(entry => entry.id)),
					type,
					action,
					delayMinutes: input.delay_minutes,
					fireAt: new Date(now.valueOf() + (input.delay_minutes * MINUTE_MS)),
				};
				break;
			default:
				throw new Error("Error: type must be 'periodic', 'daily', or 'once'");
		}

		if (!entry.id)
			throw new Error("Error: no free schedule slots");
		if (this.#entries.length >= LIMITS.cronMaxEntries)
			throw new Error("Error: no free schedule slots");

		entry.nextFireAt = computeNextFireAt(entry, now, this.#timeZone);
		this.#entries.push(entry);
		return Object.freeze({...entry, nextFireAt: copyDate(entry.nextFireAt)});
	}

	list() {
		return this.#entries.map(entry => ({
			...entry,
			nextFireAt: copyDate(entry.nextFireAt),
			fireAt: entry.fireAt ? copyDate(entry.fireAt) : undefined,
		}));
	}

	delete(id) {
		const index = this.#entries.findIndex(entry => entry.id === id);
		if (index < 0)
			return false;
		this.#entries.splice(index, 1);
		return true;
	}

	due(now = new Date()) {
		return this.#entries
			.filter(entry => entry.nextFireAt.valueOf() <= now.valueOf())
			.map(entry => ({...entry, nextFireAt: copyDate(entry.nextFireAt)}));
	}

	fireDue(now = new Date()) {
		const due = [];
		for (let i = this.#entries.length - 1; i >= 0; i--) {
			const entry = this.#entries[i];
			if (entry.nextFireAt.valueOf() > now.valueOf())
				continue;

			due.unshift({...entry, nextFireAt: copyDate(entry.nextFireAt)});
			if ("once" === entry.type) {
				this.#entries.splice(i, 1);
				continue;
			}
			entry.nextFireAt = computeNextFireAt(entry, now, this.#timeZone);
		}
		return due;
	}
}

export function describeSchedule(entry, timeZoneAbbreviation = "UTC") {
	switch (entry.type) {
		case "periodic":
			return `Created schedule #${entry.id}: every ${entry.intervalMinutes} min → ${entry.action}`;
		case "daily":
			return `Created schedule #${entry.id}: daily at ${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")} ${timeZoneAbbreviation} → ${entry.action}`;
		case "once":
			return `Created schedule #${entry.id}: once in ${entry.delayMinutes} min → ${entry.action}`;
		default:
			throw new Error(`Error: unknown schedule type '${entry.type}'`);
	}
}
