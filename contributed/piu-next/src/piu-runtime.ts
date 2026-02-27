import { attachRef, detachRef, type Ref } from "ref";
import type { ElementNode } from "ir";
import { effect, type Unsubscribe } from "signal";

type Dictionary = Record<string, unknown>;
type TapHandler = (content: unknown, event: { index: number; x: number; y: number; ticks: number }) => void;

interface PiuContainer {
	empty(start?: number, stop?: number): void;
	add(content: unknown): void;
}

interface PiuApplication extends PiuContainer {
	skin?: unknown;
	style?: unknown;
	state?: unknown;
	variant?: unknown;
}

interface PiuCtor {
	new(owner: unknown, dictionary?: Dictionary): unknown;
}

interface PiuGlobals {
	Application: PiuCtor;
	Container: PiuCtor;
	Column: PiuCtor;
	Row: PiuCtor;
	Content: PiuCtor;
	Label: PiuCtor;
	Behavior: new(...args: readonly never[]) => object;
}

interface RefBinding {
	ref: Ref<unknown>;
	target: unknown;
}

interface RenderedTree {
	rootType: string;
	rootProps: Dictionary;
	children: unknown[];
}

export interface TaskQueue {
	post(task: () => void): void;
}

export interface MountPiuOptions {
	application?: PiuApplication;
	taskQueue?: TaskQueue;
}

export interface MountedPiuApplication {
	application: PiuApplication;
	dispose(): void;
}

function getPiuGlobals(): PiuGlobals {
	const scope = globalThis as unknown as Partial<PiuGlobals>;
	if (!scope.Application || !scope.Container || !scope.Column || !scope.Row || !scope.Content || !scope.Label || !scope.Behavior)
		throw new Error("Piu globals are unavailable. Import \"piu/MC\" before mountPiuApplication.");
	return scope as PiuGlobals;
}

function createDefaultTaskQueue(): TaskQueue {
	return {
		post(task: () => void): void {
			task();
		},
	};
}

function sanitizeProps(props: Dictionary, excludes: readonly string[]): Dictionary {
	const dictionary: Dictionary = {};
	for (const [key, value] of Object.entries(props)) {
		if (excludes.includes(key))
			continue;
		dictionary[key] = value;
	}
	return dictionary;
}

function extractLabelString(node: ElementNode): string | undefined {
	if (typeof node.props.string === "string")
		return node.props.string;
	if (typeof node.props.text === "string")
		return node.props.text;
	let joined = "";
	let hasText = false;
	for (const child of node.children) {
		if (child.kind === "text") {
			joined += child.value;
			hasText = true;
		}
	}
	return hasText ? joined : undefined;
}

function createTapBehavior(
	globals: PiuGlobals,
	onTap: TapHandler,
	taskQueue: TaskQueue,
): new(...args: readonly never[]) => object {
	const Base = globals.Behavior;
	return class extends Base {
		onTouchEnded(content: unknown, index: number, x: number, y: number, ticks: number): void {
			taskQueue.post(() => {
				onTap(content, { index, x, y, ticks });
			});
		}
	};
}

function instantiateNode(
	node: ElementNode,
	globals: PiuGlobals,
	refBindings: RefBinding[],
	taskQueue: TaskQueue,
): unknown {
	const onTap = typeof node.props.onTap === "function"
		? node.props.onTap as TapHandler
		: null;
	const ref = (typeof node.props.ref === "object" && node.props.ref !== null)
		? node.props.ref as Ref<unknown>
		: null;

	switch (node.type) {
		case "container":
		case "column":
		case "row": {
			const contents = node.children
				.filter((child) => child.kind === "element")
				.map((child) => instantiateNode(child, globals, refBindings, taskQueue));
			const dictionary = sanitizeProps(node.props as Dictionary, ["onTap", "ref", "key"]);
			dictionary.contents = contents;
			if (onTap) {
				dictionary.active = true;
				dictionary.Behavior = createTapBehavior(globals, onTap, taskQueue);
			}
			const ctor = (node.type === "container")
				? globals.Container
				: (node.type === "column")
					? globals.Column
					: globals.Row;
			const content = new ctor(null, dictionary);
			if (ref) {
				attachRef(ref, content);
				refBindings.push({ ref, target: content });
			}
			return content;
		}
		case "label": {
			const dictionary = sanitizeProps(node.props as Dictionary, ["onTap", "ref", "key", "text"]);
			const stringValue = extractLabelString(node);
			if (stringValue !== undefined)
				dictionary.string = stringValue;
			if (onTap) {
				dictionary.active = true;
				dictionary.Behavior = createTapBehavior(globals, onTap, taskQueue);
			}
			const label = new globals.Label(null, dictionary);
			if (ref) {
				attachRef(ref, label);
				refBindings.push({ ref, target: label });
			}
			return label;
		}
		case "content": {
			const dictionary = sanitizeProps(node.props as Dictionary, ["onTap", "ref", "key"]);
			if (onTap) {
				dictionary.active = true;
				dictionary.Behavior = createTapBehavior(globals, onTap, taskQueue);
			}
			const content = new globals.Content(null, dictionary);
			if (ref) {
				attachRef(ref, content);
				refBindings.push({ ref, target: content });
			}
			return content;
		}
		default:
			throw new Error(`Unsupported node type: ${node.type}`);
	}
}

function renderTree(
	root: ElementNode,
	globals: PiuGlobals,
	refBindings: RefBinding[],
	taskQueue: TaskQueue,
): RenderedTree {
	if (root.type !== "application")
		throw new Error("Root node must be <application>.");
	const rootProps = sanitizeProps(root.props as Dictionary, ["onTap", "ref", "key"]);
	const children = root.children
		.filter((child) => child.kind === "element")
		.map((child) => instantiateNode(child, globals, refBindings, taskQueue));
	return {
		rootType: root.type,
		rootProps,
		children,
	};
}

function applyAppProps(application: PiuApplication, rootProps: Dictionary): void {
	if ("skin" in rootProps)
		application.skin = rootProps.skin;
	if ("style" in rootProps)
		application.style = rootProps.style;
	if ("state" in rootProps)
		application.state = rootProps.state;
	if ("variant" in rootProps)
		application.variant = rootProps.variant;
}

export function mountPiuApplication(
	view: () => ElementNode,
	options: MountPiuOptions = {},
): MountedPiuApplication {
	const globals = getPiuGlobals();
	const taskQueue = options.taskQueue ?? createDefaultTaskQueue();
	let application = options.application ?? null;
	let disposeEffect: Unsubscribe | null = null;
	let refBindings: RefBinding[] = [];
	let disposed = false;
	let queued = false;
	let pendingRoot: ElementNode | null = null;

	const clearRefs = (): void => {
		for (const binding of refBindings)
			detachRef(binding.ref, binding.target);
		refBindings = [];
	};

	const render = (root: ElementNode): void => {
		clearRefs();
		const rendered = renderTree(root, globals, refBindings, taskQueue);
		if (!application)
			application = new globals.Application(null, rendered.rootProps) as PiuApplication;
		applyAppProps(application, rendered.rootProps);
		application.empty();
		for (const child of rendered.children)
			application.add(child);
	};

	const enqueueRender = (root: ElementNode): void => {
		pendingRoot = root;
		if (queued)
			return;
		queued = true;
		taskQueue.post(() => {
			queued = false;
			if (disposed || !pendingRoot)
				return;
			const next = pendingRoot;
			pendingRoot = null;
			render(next);
		});
	};

	render(view());
	let skipFirstEffectRun = true;
	disposeEffect = effect(() => {
		const nextRoot = view();
		if (skipFirstEffectRun) {
			skipFirstEffectRun = false;
			return;
		}
		enqueueRender(nextRoot);
	});

	if (!application)
		throw new Error("Application failed to mount.");

	return {
		application,
		dispose(): void {
			disposed = true;
			disposeEffect?.();
			disposeEffect = null;
			clearRefs();
			application?.empty();
		},
	};
}
