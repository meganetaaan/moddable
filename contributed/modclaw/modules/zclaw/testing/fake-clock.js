export class FakeClock {
	#now;

	constructor(now = new Date("2026-01-01T00:00:00Z")) {
		this.#now = new Date(now.valueOf());
	}

	now() {
		return new Date(this.#now.valueOf());
	}

	advance(ms) {
		this.#now = new Date(this.#now.valueOf() + ms);
		return this.now();
	}

	set(value) {
		this.#now = new Date(value.valueOf());
		return this.now();
	}
}
