import type { WritableSignal } from "signal";

export type Easing = (progress: number) => number;

export interface Scheduler {
	now(): number;
	every(intervalMs: number, callback: () => void): unknown;
	clear(handle: unknown): void;
}

export interface TweenOptions {
	from?: number;
	to: number;
	duration: number;
	easing?: Easing;
	intervalMs?: number;
	scheduler?: Scheduler;
	driver?: TweenDriver;
	onComplete?: () => void;
}

export interface TweenHandle {
	stop(): void;
}

export interface TweenDriverContext {
	signal: WritableSignal<number>;
	from: number;
	to: number;
	duration: number;
	easing: Easing;
	intervalMs: number;
	onComplete: (() => void) | undefined;
}

export interface TweenDriver {
	start(context: TweenDriverContext): TweenHandle | null;
}

const linear: Easing = (progress: number): number => progress;
let nativeTweenDriver: TweenDriver | null = null;

export const easings = Object.freeze({
	linear,
	easeInOutQuad: (progress: number): number =>
		(progress < 0.5)
			? (2 * progress * progress)
			: (1 - (Math.pow(-2 * progress + 2, 2) / 2)),
});

export function setNativeTweenDriver(driver: TweenDriver | null): void {
	nativeTweenDriver = driver;
}

function clamp01(value: number): number {
	if (value <= 0)
		return 0;
	if (value >= 1)
		return 1;
	return value;
}

function createDefaultScheduler(): Scheduler {
	const intervalHost = globalThis as unknown as {
		setInterval?: (callback: () => void, intervalMs: number) => unknown;
		clearInterval?: (handle: unknown) => void;
	};
	if (!intervalHost.setInterval || !intervalHost.clearInterval)
		throw new Error("No default interval scheduler available. Pass options.scheduler.");
	return {
		now: (): number => Date.now(),
		every: (intervalMs: number, callback: () => void): unknown =>
			intervalHost.setInterval!(callback, intervalMs),
		clear: (handle: unknown): void =>
			intervalHost.clearInterval!(handle),
	};
}

export function tweenSignal(signal: WritableSignal<number>, options: TweenOptions): TweenHandle {
	const easing = options.easing ?? linear;
	const duration = Math.max(0, options.duration);
	const intervalMs = Math.max(1, options.intervalMs ?? 16);
	const startValue = options.from ?? signal.value;
	const endValue = options.to;
	const driverContext: TweenDriverContext = {
		signal,
		from: startValue,
		to: endValue,
		duration,
		easing,
		intervalMs,
		onComplete: options.onComplete,
	};
	const preferredDriver = options.driver ?? nativeTweenDriver;
	if (preferredDriver) {
		const handle = preferredDriver.start(driverContext);
		if (handle)
			return handle;
	}
	const scheduler = options.scheduler ?? createDefaultScheduler();

	let running = true;
	let timerHandle: unknown = null;
	const startTime = scheduler.now();

	const stop = (): void => {
		if (!running)
			return;
		running = false;
		if (timerHandle !== null)
			scheduler.clear(timerHandle);
		timerHandle = null;
	};

	if (duration === 0) {
		signal.set(endValue);
		options.onComplete?.();
		return { stop };
	}

	signal.set(startValue);
	timerHandle = scheduler.every(intervalMs, () => {
		if (!running)
			return;
		const elapsed = scheduler.now() - startTime;
		const progress = clamp01(elapsed / duration);
		const eased = clamp01(easing(progress));
		const next = startValue + ((endValue - startValue) * eased);
		signal.set(next);
		if (progress >= 1) {
			stop();
			signal.set(endValue);
			options.onComplete?.();
		}
	});

	return { stop };
}
