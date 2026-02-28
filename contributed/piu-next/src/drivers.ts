import { setNativeTweenDriver, type TweenDriver, type TweenHandle, type TweenDriverContext } from "animation";
import { mountPiuApplication, setNativeRuntimeDriver, type RuntimeDriver, type RuntimeDriverSession } from "piu-runtime";
import { createSignal } from "signal";
import type { ElementNode } from "ir";

export interface NativeRuntimeBridgeSession {
	application: unknown;
	update(root: ElementNode): void;
	dispose(): void;
}

export interface NativeRuntimeBridgeContext {
	application?: unknown;
	postTask(task: () => void): void;
}

export interface NativeRuntimeBridge {
	mount(root: ElementNode, context: NativeRuntimeBridgeContext): NativeRuntimeBridgeSession | null;
}

export interface NativeTweenBridgeContext {
	from: number;
	to: number;
	duration: number;
	easing: (progress: number) => number;
	intervalMs: number;
	onUpdate(value: number): void;
	onComplete: (() => void) | undefined;
}

export interface NativeTweenBridge {
	start(context: NativeTweenBridgeContext): TweenHandle | null;
}

export interface NativeDriverRegistry {
	runtime?: NativeRuntimeBridge | null;
	tween?: NativeTweenBridge | null;
}

export interface NativeDriverGlobals {
	__piuNextRuntimeBridge?: NativeRuntimeBridge;
	__piuNextTweenBridge?: NativeTweenBridge;
}

interface IntervalHost {
	start(callback: () => void, intervalMs: number): unknown;
	stop(handle: unknown): void;
}

function clamp01(value: number): number {
	if (value <= 0)
		return 0;
	if (value >= 1)
		return 1;
	return value;
}

function getIntervalHost(): IntervalHost {
	const scope = globalThis as unknown as {
		setInterval?: (callback: () => void, intervalMs: number) => unknown;
		clearInterval?: (handle: unknown) => void;
		Timer?: {
			repeat?: (callback: () => void, intervalMs: number) => unknown;
			clear?: (handle: unknown) => void;
		};
	};
	if (scope.Timer?.repeat && scope.Timer?.clear) {
		return {
			start: (callback: () => void, intervalMs: number): unknown =>
				scope.Timer!.repeat!(callback, intervalMs),
			stop: (handle: unknown): void =>
				scope.Timer!.clear!(handle),
		};
	}
	if (scope.setInterval && scope.clearInterval) {
		return {
			start: (callback: () => void, intervalMs: number): unknown =>
				scope.setInterval!(callback, intervalMs),
			stop: (handle: unknown): void =>
				scope.clearInterval!(handle),
		};
	}
	throw new Error("No interval host available for tween driver.");
}

export function createBridgeRuntimeDriver(bridge: NativeRuntimeBridge): RuntimeDriver {
	return {
		mount(root, context): RuntimeDriverSession | null {
			const session = bridge.mount(root, {
				application: context.application,
				postTask: (task: () => void): void => context.taskQueue.post(task),
			});
			if (!session)
				return null;
			return {
				application: session.application,
				update(nextRoot: ElementNode): void {
					session.update(nextRoot);
				},
				dispose(): void {
					session.dispose();
				},
			};
		},
	};
}

export function createBridgeTweenDriver(bridge: NativeTweenBridge): TweenDriver {
	return {
		start(context: TweenDriverContext): TweenHandle | null {
			return bridge.start({
				from: context.from,
				to: context.to,
				duration: context.duration,
				easing: context.easing,
				intervalMs: context.intervalMs,
				onUpdate: (value: number): void => {
					context.signal.set(value);
				},
				onComplete: context.onComplete,
			});
		},
	};
}

export function createReferenceRuntimeDriver(): RuntimeDriver {
	return {
		mount(root: ElementNode, context): RuntimeDriverSession {
			const rootSignal = createSignal(root);
			const mounted = mountPiuApplication(
				() => rootSignal.value,
				{
					application: context.application as never,
					taskQueue: context.taskQueue,
					driver: null,
				},
			);
			return {
				application: mounted.application,
				update(nextRoot: ElementNode): void {
					rootSignal.set(nextRoot);
				},
				dispose(): void {
					mounted.dispose();
				},
			};
		},
	};
}

export function createReferenceTweenDriver(): TweenDriver {
	return {
		start(context: TweenDriverContext): TweenHandle {
			const duration = Math.max(0, context.duration);
			const intervalMs = Math.max(1, context.intervalMs);
			if (duration === 0) {
				context.signal.set(context.to);
				context.onComplete?.();
				return { stop(): void {} };
			}

			const host = getIntervalHost();
			let running = true;
			let handle: unknown = null;
			const startTime = Date.now();

			const stop = (): void => {
				if (!running)
					return;
				running = false;
				if (handle !== null)
					host.stop(handle);
				handle = null;
			};

			context.signal.set(context.from);
			handle = host.start(() => {
				if (!running)
					return;
				const elapsed = Date.now() - startTime;
				const progress = clamp01(elapsed / duration);
				const eased = clamp01(context.easing(progress));
				const next = context.from + ((context.to - context.from) * eased);
				context.signal.set(next);
				if (progress >= 1) {
					stop();
					context.signal.set(context.to);
					context.onComplete?.();
				}
			}, intervalMs);

			return { stop };
		},
	};
}

export function installNativeDrivers(registry: NativeDriverRegistry): void {
	setNativeRuntimeDriver(registry.runtime ? createBridgeRuntimeDriver(registry.runtime) : null);
	setNativeTweenDriver(registry.tween ? createBridgeTweenDriver(registry.tween) : null);
}

export function installNativeDriversFromGlobals(scope: NativeDriverGlobals = globalThis as NativeDriverGlobals): void {
	installNativeDrivers({
		runtime: scope.__piuNextRuntimeBridge ?? null,
		tween: scope.__piuNextTweenBridge ?? null,
	});
}
