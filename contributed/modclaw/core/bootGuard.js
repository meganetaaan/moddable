import {NVS_KEYS} from "./nvsKeys.js";

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

function parseBootCountOrZero(value) {
	if ((undefined === value) || (null === value) || ("" === value))
		return 0;

	const text = String(value);
	if (!/^[0-9]+$/.test(text))
		return 0;

	const parsed = Number(text);
	if (!Number.isSafeInteger(parsed))
		return 0;
	return parsed;
}

export function bootGuardNextCount(currentCount) {
	return Math.max(0, Number.isInteger(currentCount) ? currentCount : 0) + 1;
}

export function bootGuardShouldEnterSafeMode(currentCount, maxFailures) {
	if (!Number.isInteger(maxFailures) || maxFailures <= 0)
		return false;
	return bootGuardNextCount(currentCount) >= maxFailures;
}

export function bootGuardGetPersistedCount(store) {
	return parseBootCountOrZero(storeGet(store, NVS_KEYS.BOOT_COUNT));
}

export function bootGuardSetPersistedCount(store, count) {
	try {
		return storeSet(store, NVS_KEYS.BOOT_COUNT, String(count));
	}
	catch {
		return false;
	}
}
