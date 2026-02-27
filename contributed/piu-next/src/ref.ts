export interface Ref<T> {
	current: T | null;
}

export function createRef<T>(): Ref<T> {
	return { current: null };
}

export function attachRef<T>(ref: Ref<T>, target: T): void {
	ref.current = target;
}

export function detachRef<T>(ref: Ref<T>, expected?: T): void {
	if ((expected !== undefined) && (ref.current !== expected))
		return;
	ref.current = null;
}
