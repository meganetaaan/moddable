import {LIMITS, SENSITIVE_MEMORY_KEYS, USER_MEMORY_KEY_PREFIX} from "./constants.js";
import {validateNVSKey, validateStringInput, validateUserMemoryKey} from "./validate.js";

export function isUserMemoryKey(key) {
	return String(key ?? "").startsWith(USER_MEMORY_KEY_PREFIX);
}

export function isSensitiveMemoryKey(key) {
	return SENSITIVE_MEMORY_KEYS.includes(key);
}

export class MemoryStore {
	#storage;

	constructor(storage = new Map()) {
		this.#storage = storage;
	}

	set(key, value) {
		const validatedKey = validateUserMemoryKey(key);
		if (isSensitiveMemoryKey(validatedKey))
			throw new Error(`Error: cannot modify system key '${validatedKey}'`);

		const validatedValue = validateStringInput(value, LIMITS.nvsMaxValueLength);
		this.#storage.set(validatedKey, validatedValue);
		return `Saved: ${validatedKey} = ${validatedValue}`;
	}

	get(key) {
		const validatedKey = validateUserMemoryKey(key);
		if (isSensitiveMemoryKey(validatedKey))
			throw new Error(`Error: cannot access system key '${validatedKey}'`);

		if (!this.#storage.has(validatedKey))
			return `Key '${validatedKey}' not found`;

		return `${validatedKey} = ${this.#storage.get(validatedKey)}`;
	}

	list() {
		const keys = [];
		for (const key of this.#storage.keys()) {
			if (!isUserMemoryKey(key))
				continue;
			if (isSensitiveMemoryKey(key))
				continue;
			keys.push(key);
		}
		keys.sort();
		return keys.length ? `Stored keys: ${keys.join(", ")}` : "No stored keys";
	}

	delete(key) {
		const validatedKey = validateUserMemoryKey(key);
		if (isSensitiveMemoryKey(validatedKey))
			throw new Error(`Error: cannot delete system key '${validatedKey}'`);
		if (!this.#storage.has(validatedKey))
			return `Key not found: ${validatedKey}`;
		this.#storage.delete(validatedKey);
		return `Deleted: ${validatedKey}`;
	}

	readRaw(key) {
		const validatedKey = validateNVSKey(key);
		return this.#storage.get(validatedKey);
	}

	writeRaw(key, value) {
		const validatedKey = validateNVSKey(key);
		const validatedValue = validateStringInput(value, LIMITS.nvsMaxValueLength);
		this.#storage.set(validatedKey, validatedValue);
	}
}
