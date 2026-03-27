/*---
description:
flags: [module]
---*/

import {
	CronScheduler,
	nextEntryId,
	resolveTimezoneToPosix,
	trimAsciiWhitespace,
	validateDailyTime,
	validatePeriodicInterval,
} from "../../../contributed/modclaw/modules/cron.js";

assert(validatePeriodicInterval(1));
assert(validatePeriodicInterval(1440));
assert(!validatePeriodicInterval(0));
assert(!validatePeriodicInterval(1441));

assert(validateDailyTime(0, 0));
assert(validateDailyTime(23, 59));
assert(!validateDailyTime(-1, 0));
assert(!validateDailyTime(24, 0));
assert(!validateDailyTime(1, 60));

assert.sameValue(nextEntryId([1, 2, 4]), 3);
assert.sameValue(nextEntryId([]), 1);

assert.sameValue(trimAsciiWhitespace(" \t hello \r\n"), "hello");
assert.sameValue(trimAsciiWhitespace(null), "");

let timezone = resolveTimezoneToPosix("America/Los_Angeles");
assert.sameValue(timezone.ok, true);
assert.sameValue(timezone.timezonePosix, "PST8PDT,M3.2.0/2,M11.1.0/2");

timezone = resolveTimezoneToPosix("UTC");
assert.sameValue(timezone.ok, true);
assert.sameValue(timezone.timezonePosix, "UTC0");

timezone = resolveTimezoneToPosix("EST5EDT,M3.2.0/2,M11.1.0/2");
assert.sameValue(timezone.ok, true);
assert.sameValue(timezone.timezonePosix, "EST5EDT,M3.2.0/2,M11.1.0/2");

timezone = resolveTimezoneToPosix("Europe/Berlin");
assert.sameValue(timezone.ok, false);
assert(timezone.error.includes("timezone name not recognized"));

timezone = resolveTimezoneToPosix("UTC 0");
assert.sameValue(timezone.ok, false);
assert.sameValue(timezone.error, "Error: timezone must not contain spaces");

let now = Date.UTC(2026, 2, 18, 0, 0, 0);
const scheduler = new CronScheduler({
	now() {
		return now;
	},
	timezone: {
		posix: "UTC0",
		offsetMinutes: 0,
		abbreviation: "UTC",
	},
});

const periodicId = scheduler.create({
	type: "periodic",
	intervalMinutes: 10,
	action: "ping",
});
const onceId = scheduler.create({
	type: "once",
	delayMinutes: 20,
	action: "run once",
});
assert.sameValue(periodicId, 1);
assert.sameValue(onceId, 2);
assert.sameValue(scheduler.list().length, 2);

now += 10 * 60 * 1000;
let due = scheduler.collectDue();
assert.sameValue(due.length, 1);
assert.sameValue(due[0].id, periodicId);
assert.sameValue(due[0].action, "ping");
assert.sameValue(scheduler.list().length, 2);

now += 21 * 60 * 1000;
due = scheduler.collectDue();
assert.sameValue(due.length, 2);
assert.sameValue(due[0].id, periodicId);
assert.sameValue(due[1].id, onceId);
assert.sameValue(scheduler.list().length, 1);

assert.sameValue(scheduler.delete(periodicId), true);
assert.sameValue(scheduler.delete(periodicId), false);

now = Date.UTC(2026, 2, 18, 15, 59, 50);
const dailyScheduler = new CronScheduler({
	now() {
		return now;
	},
	timezone: {
		posix: "PST8PDT,M3.2.0/2,M11.1.0/2",
		offsetMinutes: -8 * 60,
		abbreviation: "PST",
	},
});

const dailyId = dailyScheduler.create({
	type: "daily",
	hour: 8,
	minute: 0,
	action: "daily reminder",
});
assert.sameValue(dailyId, 1);

now += 10 * 1000;
due = dailyScheduler.collectDue();
assert.sameValue(due.length, 1);
assert.sameValue(due[0].action, "daily reminder");
assert.sameValue(dailyScheduler.list().length, 1);

assert.throws(RangeError, () => scheduler.create({type: "periodic", intervalMinutes: 0, action: "bad"}));
assert.throws(RangeError, () => scheduler.create({type: "daily", hour: 24, minute: 0, action: "bad"}));
assert.throws(TypeError, () => scheduler.create({type: "once", delayMinutes: 1}));
