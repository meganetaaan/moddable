import {CRON_MAX_ACTION_LEN, NVS_MAX_VALUE_LEN} from "./config.js";
import {isSensitiveMemoryKey, isUserMemoryKey} from "./memoryKeys.js";
import {
	validateNVSKey,
	validateStringInput,
	validateUserMemoryKey,
} from "./validate.js";

export {isSensitiveMemoryKey, isUserMemoryKey};

export class MemoryStore {
	#storage;

	constructor(storage = new Map()) {
		this.#storage = storage;
	}

	set(key, value) {
		const validatedKey = validateUserMemoryKey(key);
		if (isSensitiveMemoryKey(validatedKey))
			throw new Error(`Error: cannot modify system key '${validatedKey}'`);

		const validatedValue = validateStringInput(value, NVS_MAX_VALUE_LEN);
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
		const validatedValue = validateStringInput(value, NVS_MAX_VALUE_LEN);
		this.#storage.set(validatedKey, validatedValue);
	}
}
