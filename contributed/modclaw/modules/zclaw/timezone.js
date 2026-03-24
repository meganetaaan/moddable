import {DEFAULT_TIMEZONE_POSIX, LIMITS, TIMEZONE_ALIASES} from "./constants.js";

function trimASCIIWhitespace(value) {
	if (undefined === value || null === value)
		return "";

	let start = 0;
	let end = value.length;
	while ((start < end) && isASCIIWhitespace(value[start]))
		start++;
	while ((end > start) && isASCIIWhitespace(value[end - 1]))
		end--;
	return value.slice(start, end);
}

function isASCIIWhitespace(char) {
	return (" " === char) || ("\t" === char) || ("\r" === char) || ("\n" === char);
}

export function normalizeTimezone(value) {
	const trimmed = trimASCIIWhitespace(String(value ?? ""));
	if (!trimmed)
		throw new Error("Error: timezone must be non-empty");
	if (trimmed.length > LIMITS.timezoneMaxLength - 1)
		throw new Error(`Error: string too long (max ${LIMITS.timezoneMaxLength - 1} chars)`);

	for (const key of Object.keys(TIMEZONE_ALIASES)) {
		if (key.toLowerCase() === trimmed.toLowerCase())
			return TIMEZONE_ALIASES[key];
	}

	if (trimmed.includes("/")) {
		throw new Error("Error: timezone name not recognized. Use UTC, America/Los_Angeles, America/Denver, America/Chicago, America/New_York, or a POSIX TZ string.");
	}

	if (trimmed.includes(" ") || trimmed.includes("\t"))
		throw new Error("Error: timezone must not contain spaces");

	return trimmed;
}

export function abbreviateTimezone(posix) {
	const trimmed = trimASCIIWhitespace(String(posix || DEFAULT_TIMEZONE_POSIX));
	let normalized = trimmed;

	for (const key of Object.keys(TIMEZONE_ALIASES)) {
		if (key.toLowerCase() === trimmed.toLowerCase()) {
			normalized = TIMEZONE_ALIASES[key];
			break;
		}
	}

	const match = normalized.match(/^[A-Za-z]+/);
	return match ? match[0] : "UTC";
}

export function defaultTimezone() {
	return DEFAULT_TIMEZONE_POSIX;
}
