export type Unsubscribe = () => void;

export interface ReadonlySignal<T> {
	readonly value: T;
	subscribe(subscriber: () => void): Unsubscribe;
}

export interface WritableSignal<T> extends ReadonlySignal<T> {
	set(next: T): void;
	update(mapper: (current: T) => T): void;
}

interface Dependency {
	subscribe(subscriber: () => void): Unsubscribe;
}

interface Collector {
	track(dependency: Dependency): void;
}

let activeCollector: Collector | null = null;
let batchDepth = 0;
let flushingSubscribers = false;
const pendingSubscribers = new Set<() => void>();

function withCollector<T>(collector: Collector, run: () => T): T {
	const previousCollector = activeCollector;
	activeCollector = collector;
	try {
		return run();
	}
	finally {
		activeCollector = previousCollector;
	}
}

function enqueueSubscribers(subscribers: ReadonlySet<() => void>): void {
	for (const subscriber of subscribers)
		pendingSubscribers.add(subscriber);
}

function flushPendingSubscribers(): void {
	if (flushingSubscribers)
		return;
	flushingSubscribers = true;
	try {
		while (pendingSubscribers.size > 0) {
			const subscribers = [...pendingSubscribers];
			pendingSubscribers.clear();
			for (const subscriber of subscribers)
				subscriber();
		}
	}
	finally {
		flushingSubscribers = false;
	}
}

function notify(subscribers: ReadonlySet<() => void>): void {
	if (subscribers.size === 0)
		return;
	if (batchDepth > 0 || flushingSubscribers) {
		enqueueSubscribers(subscribers);
		return;
	}
	for (const subscriber of [...subscribers])
		subscriber();
	flushPendingSubscribers();
}

class SignalImpl<T> implements WritableSignal<T>, Dependency {
	#value: T;
	#subscribers = new Set<() => void>();

	constructor(initial: T) {
		this.#value = initial;
	}

	get value(): T {
		activeCollector?.track(this);
		return this.#value;
	}

	set(next: T): void {
		if (Object.is(this.#value, next))
			return;
		this.#value = next;
		notify(this.#subscribers);
	}

	update(mapper: (current: T) => T): void {
		this.set(mapper(this.#value));
	}

	subscribe(subscriber: () => void): Unsubscribe {
		this.#subscribers.add(subscriber);
		return () => {
			this.#subscribers.delete(subscriber);
		};
	}
}

class ComputedImpl<T> implements ReadonlySignal<T>, Dependency {
	#compute: () => T;
	#dirty = true;
	#cached!: T;
	#subscribers = new Set<() => void>();
	#dependencies = new Map<Dependency, Unsubscribe>();

	readonly #markDirty = (): void => {
		if (this.#dirty)
			return;
		this.#dirty = true;
		notify(this.#subscribers);
	};

	constructor(compute: () => T) {
		this.#compute = compute;
	}

	get value(): T {
		activeCollector?.track(this);
		if (this.#dirty)
			this.#recompute();
		return this.#cached;
	}

	subscribe(subscriber: () => void): Unsubscribe {
		this.#subscribers.add(subscriber);
		return () => {
			this.#subscribers.delete(subscriber);
		};
	}

	#recompute(): void {
		const nextDependencies = new Set<Dependency>();
		const collector: Collector = {
			track: (dependency: Dependency): void => {
				nextDependencies.add(dependency);
				if (!this.#dependencies.has(dependency))
					this.#dependencies.set(dependency, dependency.subscribe(this.#markDirty));
			},
		};

		this.#cached = withCollector(collector, this.#compute);

		for (const [dependency, unsubscribe] of this.#dependencies) {
			if (!nextDependencies.has(dependency)) {
				unsubscribe();
				this.#dependencies.delete(dependency);
			}
		}
		this.#dirty = false;
	}
}

class EffectImpl {
	#run: () => void;
	#dependencies = new Map<Dependency, Unsubscribe>();
	#disposed = false;
	#running = false;
	#pending = false;

	readonly #rerun = (): void => {
		if (this.#disposed)
			return;
		this.#schedule();
	};

	constructor(run: () => void) {
		this.#run = run;
		this.#schedule();
	}

	dispose(): void {
		if (this.#disposed)
			return;
		this.#disposed = true;
		for (const unsubscribe of this.#dependencies.values())
			unsubscribe();
		this.#dependencies.clear();
	}

	#schedule(): void {
		if (this.#running) {
			this.#pending = true;
			return;
		}
		this.#running = true;
		try {
			do {
				this.#pending = false;
				this.#execute();
			} while (this.#pending && !this.#disposed);
		}
		finally {
			this.#running = false;
		}
	}

	#execute(): void {
		const nextDependencies = new Set<Dependency>();
		const collector: Collector = {
			track: (dependency: Dependency): void => {
				nextDependencies.add(dependency);
				if (!this.#dependencies.has(dependency))
					this.#dependencies.set(dependency, dependency.subscribe(this.#rerun));
			},
		};

		withCollector(collector, this.#run);

		for (const [dependency, unsubscribe] of this.#dependencies) {
			if (!nextDependencies.has(dependency)) {
				unsubscribe();
				this.#dependencies.delete(dependency);
			}
		}
	}
}

export function createSignal<T>(initial: T): WritableSignal<T> {
	return new SignalImpl(initial);
}

export function createComputed<T>(compute: () => T): ReadonlySignal<T> {
	return new ComputedImpl(compute);
}

export function effect(run: () => void): Unsubscribe {
	const reactiveEffect = new EffectImpl(run);
	return () => {
		reactiveEffect.dispose();
	};
}

export function batch<T>(run: () => T): T {
	batchDepth += 1;
	try {
		return run();
	}
	finally {
		batchDepth -= 1;
		if (batchDepth === 0)
			flushPendingSubscribers();
	}
}
