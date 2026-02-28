type ResourceDisposer<T> = (resource: T) => void;

export interface ResourceHandle<T> {
	readonly value: T;
	readonly released: boolean;
	release(): void;
}

export interface ResourceScope {
	readonly released: boolean;
	own<T>(resource: ResourceHandle<T>): ResourceHandle<T>;
	releaseAll(): void;
}

type ResourceDictionary = Readonly<Record<string, unknown>>;
type ResourceCtor = new(dictionary?: ResourceDictionary) => unknown;

class ResourceHandleImpl<T> implements ResourceHandle<T> {
	#value: T;
	#disposer: ResourceDisposer<T> | null;
	#released = false;

	constructor(value: T, disposer: ResourceDisposer<T> | null) {
		this.#value = value;
		this.#disposer = disposer;
	}

	get value(): T {
		return this.#value;
	}

	get released(): boolean {
		return this.#released;
	}

	release(): void {
		if (this.#released)
			return;
		this.#released = true;
		this.#disposer?.(this.#value);
		this.#disposer = null;
	}
}

class ResourceScopeImpl implements ResourceScope {
	#handles = new Set<ResourceHandle<unknown>>();
	#released = false;

	get released(): boolean {
		return this.#released;
	}

	own<T>(resource: ResourceHandle<T>): ResourceHandle<T> {
		if (this.#released)
			throw new Error("Cannot own resource on a released scope.");
		this.#handles.add(resource as ResourceHandle<unknown>);
		return resource;
	}

	releaseAll(): void {
		if (this.#released)
			return;
		this.#released = true;
		for (const handle of this.#handles)
			handle.release();
		this.#handles.clear();
	}
}

function getResourceCtor(globalName: "Skin" | "Style"): ResourceCtor {
	const scope = globalThis as unknown as Partial<Record<"Skin" | "Style", ResourceCtor>>;
	const ctor = scope[globalName];
	if (!ctor) {
		throw new Error(
			`${globalName} constructor is unavailable. Ensure Moddable typings and runtime globals are loaded before creating resources.`,
		);
	}
	return ctor;
}

export function createResource<T>(create: () => T, dispose?: ResourceDisposer<T>): ResourceHandle<T> {
	return new ResourceHandleImpl(create(), dispose ?? null);
}

export function createResourceScope(): ResourceScope {
	return new ResourceScopeImpl();
}

export function createSkinResource(options: ResourceDictionary): ResourceHandle<unknown> {
	const SkinCtor = getResourceCtor("Skin");
	return createResource(() => new SkinCtor(options));
}

export function createStyleResource(options: ResourceDictionary): ResourceHandle<unknown> {
	const StyleCtor = getResourceCtor("Style");
	return createResource(() => new StyleCtor(options));
}
