import {
	NVS_MAX_KEY_LEN,
	USER_MEMORY_KEY_PREFIX,
} from "./config.js";

export function validateStringInput(value, maxLength) {
	if ((undefined === value) || (null === value))
		throw new Error("Error: null string");

	const string = String(value);
	if (string.length > maxLength)
		throw new Error(`Error: string too long (max ${maxLength} chars)`);

	for (let i = 0; i < string.length; i++) {
		const code = string.charCodeAt(i);
		if ((code < 0x20) && (9 !== code) && (10 !== code) && (13 !== code))
			throw new Error("Error: invalid character in input");
	}

	return string;
}

export function validateNVSKey(key) {
	const string = String(key ?? "");
	if (!string.length)
		throw new Error("Error: empty key");
	if (string.length > NVS_MAX_KEY_LEN)
		throw new Error(`Error: key max ${NVS_MAX_KEY_LEN} chars`);
	if (!/^[A-Za-z0-9_]+$/.test(string))
		throw new Error("Error: key must be alphanumeric/underscore");
	return string;
}

export function validateUserMemoryKey(key) {
	const validated = validateNVSKey(key);
	if (!validated.startsWith(USER_MEMORY_KEY_PREFIX))
		throw new Error(`Error: key must start with '${USER_MEMORY_KEY_PREFIX}' (user memory only)`);
	return validated;
}
