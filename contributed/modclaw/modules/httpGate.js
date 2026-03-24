export class HttpGate {
	#busy;
	#owner;
	#queue;

	constructor() {
		this.#busy = false;
		this.#owner = "";
		this.#queue = [];
	}

	isBusy() {
		return this.#busy;
	}

	getOwner() {
		return this.#owner;
	}

	acquire(owner = "", options = {}) {
		if (!this.#busy) {
			this.#busy = true;
			this.#owner = String(owner ?? "");
			return Promise.resolve(true);
		}

		if (options.skipIfBusy)
			return Promise.resolve(false);

		return new Promise(resolve => {
			this.#queue.push({
				owner: String(owner ?? ""),
				resolve,
			});
		});
	}

	release(owner = "") {
		if (!this.#busy)
			return false;
		if (this.#owner && owner && (this.#owner !== owner))
			return false;

		const next = this.#queue.shift();
		if (next) {
			this.#owner = next.owner;
			next.resolve(true);
			return true;
		}

		this.#busy = false;
		this.#owner = "";
		return true;
	}

	async runExclusive(owner, options = {}, callback = () => undefined) {
		const acquired = await this.acquire(owner, options);
		if (!acquired)
			return {ok: false, skipped: true, value: undefined};

		try {
			return {ok: true, skipped: false, value: await callback()};
		}
		finally {
			this.release(owner);
		}
	}
}
