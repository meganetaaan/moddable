function normalizeKey(key) {
	return String(key ?? "");
}

export class PreferenceMap {
	#preference;
	#domain;
	#prefix;

	constructor(options = {}) {
		this.#preference = options.preference ?? globalThis.Preference ?? null;
		this.#domain = options.domain ?? "zclaw";
		this.#prefix = String(options.prefix ?? "");
		if (!this.#preference)
			throw new Error("Preference API is required");
	}

	#storageKey(key) {
		return this.#prefix + normalizeKey(key);
	}

	#publicKey(key) {
		return this.#prefix ? key.slice(this.#prefix.length) : key;
	}

	set(key, value) {
		this.#preference.set(this.#domain, this.#storageKey(key), value);
		return this;
	}

	get(key) {
		return this.#preference.get(this.#domain, this.#storageKey(key));
	}

	has(key) {
		return undefined !== this.get(key);
	}

	delete(key) {
		this.#preference.delete(this.#domain, this.#storageKey(key));
		return true;
	}

	keys() {
		const keys = this.#preference.keys?.(this.#domain) ?? [];
		return keys
			.filter(key => key.startsWith(this.#prefix))
			.map(key => this.#publicKey(key));
	}

	clear() {
		for (const key of this.keys())
			this.delete(key);
	}
}
