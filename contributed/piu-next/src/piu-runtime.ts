import { attachRef, detachRef, type Ref } from "ref";
import type { ElementNode } from "ir";
import { effect, type Unsubscribe } from "signal";

type Dictionary = Record<string, unknown>;
type NodeKey = string | number | symbol;
type TapHandler = (content: unknown, event: { index: number; x: number; y: number; ticks: number }) => void;
type TapAwareContent = PiuContent & { __piuNextTap?: TapHandler | null };

interface PiuContent {
	container?: PiuContainer | null;
	[key: string]: unknown;
}

interface PiuContainer extends PiuContent {
	empty(start?: number, stop?: number): void;
	add(content: unknown): void;
	insert?(content: unknown, before: unknown): void;
	remove?(content: unknown): void;
	content?(at: number): unknown;
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

interface RenderedNodeState {
	type: string;
	key: NodeKey | null;
	props: Dictionary;
	ref: Ref<unknown> | null;
	tapInstalled: boolean;
	content: TapAwareContent;
	children: RenderedNodeState[];
}

interface RenderedTree {
	rootProps: Dictionary;
	children: RenderedNodeState[];
}

export interface TaskQueue {
	post(task: () => void): void;
}

export interface RuntimeDriverSession {
	application: unknown;
	update(root: ElementNode): void;
	dispose(): void;
}

export interface RuntimeDriverContext {
	application?: unknown;
	taskQueue: TaskQueue;
}

export interface RuntimeDriver {
	mount(root: ElementNode, context: RuntimeDriverContext): RuntimeDriverSession | null;
}

export interface MountPiuOptions {
	application?: PiuApplication;
	taskQueue?: TaskQueue;
	driver?: RuntimeDriver;
}

export interface MountedPiuApplication {
	application: PiuApplication;
	dispose(): void;
}

const RESERVED_KEYS = ["onTap", "ref", "key", "text"] as const;
let nativeRuntimeDriver: RuntimeDriver | null = null;

export function setNativeRuntimeDriver(driver: RuntimeDriver | null): void {
	nativeRuntimeDriver = driver;
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

function extractElementChildren(node: ElementNode): ElementNode[] {
	const children: ElementNode[] = [];
	for (const child of node.children) {
		if (child.kind === "element")
			children.push(child);
	}
	return children;
}

function extractTapHandler(props: Readonly<Record<string, unknown>>): TapHandler | null {
	return (typeof props.onTap === "function") ? props.onTap as TapHandler : null;
}

function extractRefHandle(props: Readonly<Record<string, unknown>>): Ref<unknown> | null {
	if (typeof props.ref !== "object" || props.ref === null)
		return null;
	return props.ref as Ref<unknown>;
}

function extractNodeKey(props: Readonly<Record<string, unknown>>): NodeKey | null {
	const key = props.key;
	if ((typeof key === "string") || (typeof key === "number") || (typeof key === "symbol"))
		return key;
	return null;
}

function createTapBehavior(
	globals: PiuGlobals,
	taskQueue: TaskQueue,
): new(...args: readonly never[]) => object {
	const Base = globals.Behavior;
	return class extends Base {
		onTouchEnded(content: unknown, index: number, x: number, y: number, ticks: number): void {
			const handler = (content as TapAwareContent).__piuNextTap;
			if (typeof handler !== "function")
				return;
			taskQueue.post(() => {
				handler(content, { index, x, y, ticks });
			});
		}
	};
}

function resolveNodeCtor(type: string, globals: PiuGlobals): PiuCtor {
	switch (type) {
		case "container":
			return globals.Container;
		case "column":
			return globals.Column;
		case "row":
			return globals.Row;
		case "content":
			return globals.Content;
		case "label":
			return globals.Label;
		default:
			throw new Error(`Unsupported node type: ${type}`);
	}
}

function isContainerType(type: string): boolean {
	return (type === "container") || (type === "column") || (type === "row");
}

function buildNodeProps(node: ElementNode): Dictionary {
	const props = sanitizeProps(node.props as Dictionary, RESERVED_KEYS);
	if (node.type === "label") {
		const stringValue = extractLabelString(node);
		if (stringValue !== undefined)
			props.string = stringValue;
	}
	return props;
}

function applyProps(target: Dictionary, previous: Dictionary, next: Dictionary): void {
	for (const key of Object.keys(previous)) {
		if (Object.hasOwn(next, key))
			continue;
		target[key] = undefined;
	}
	for (const [key, value] of Object.entries(next)) {
		if (Object.is(previous[key], value))
			continue;
		target[key] = value;
	}
}

function assignTapHandler(content: TapAwareContent, tap: TapHandler | null): void {
	content.__piuNextTap = tap;
}

function updateRefBinding(node: RenderedNodeState, nextRef: Ref<unknown> | null): void {
	if (node.ref && node.ref !== nextRef)
		detachRef(node.ref, node.content);
	if (nextRef && node.ref !== nextRef)
		attachRef(nextRef, node.content);
	node.ref = nextRef;
}

function createRenderedNode(
	node: ElementNode,
	globals: PiuGlobals,
	tapBehavior: new(...args: readonly never[]) => object,
): RenderedNodeState {
	const tap = extractTapHandler(node.props);
	const ref = extractRefHandle(node.props);
	const key = extractNodeKey(node.props);
	const props = buildNodeProps(node);
	if (tap)
		props.active = true;

	const dictionary: Dictionary = { ...props };
	let children: RenderedNodeState[] = [];
	if (isContainerType(node.type)) {
		children = extractElementChildren(node)
			.map((child) => createRenderedNode(child, globals, tapBehavior));
		dictionary.contents = children.map((child) => child.content);
	}
	if (tap)
		dictionary.Behavior = tapBehavior;

	const ctor = resolveNodeCtor(node.type, globals);
	const content = new ctor(null, dictionary) as TapAwareContent;
	assignTapHandler(content, tap);
	if (ref)
		attachRef(ref, content);

	return {
		type: node.type,
		key,
		props,
		ref,
		tapInstalled: Boolean(tap),
		content,
		children,
	};
}

function disposeRenderedNode(node: RenderedNodeState): void {
	if (node.ref)
		detachRef(node.ref, node.content);
	assignTapHandler(node.content, null);
	for (const child of node.children)
		disposeRenderedNode(child);
	node.children = [];
	node.ref = null;
	node.tapInstalled = false;
}

function supportsFineGrainedMutation(container: PiuContainer): container is PiuContainer & Required<Pick<PiuContainer, "insert" | "remove" | "content">> {
	return (typeof container.insert === "function")
		&& (typeof container.remove === "function")
		&& (typeof container.content === "function");
}

function replaceAllChildren(
	container: PiuContainer,
	previous: readonly RenderedNodeState[],
	nextElements: readonly ElementNode[],
	globals: PiuGlobals,
	tapBehavior: new(...args: readonly never[]) => object,
): RenderedNodeState[] {
	for (const child of previous)
		disposeRenderedNode(child);
	container.empty();
	const next = nextElements
		.map((child) => createRenderedNode(child, globals, tapBehavior));
	for (const child of next)
		container.add(child.content);
	return next;
}

function canPatchInPlace(previous: RenderedNodeState, nextNode: ElementNode): boolean {
	if (previous.type !== nextNode.type)
		return false;
	const nextTap = extractTapHandler(nextNode.props);
	if (!previous.tapInstalled && nextTap)
		return false;
	return true;
}

function reorderChildren(
	container: PiuContainer & Required<Pick<PiuContainer, "insert" | "content">>,
	nextChildren: readonly RenderedNodeState[],
): void {
	let index = 0;
	for (const child of nextChildren) {
		const desired = child.content;
		const current = container.content(index);
		if (current === desired) {
			index += 1;
			continue;
		}
		if ((current === null) || (current === undefined)) {
			container.add(desired);
		}
		else {
			container.insert(desired, current);
		}
		index += 1;
	}
}

function patchRenderedNode(
	previous: RenderedNodeState,
	nextNode: ElementNode,
	globals: PiuGlobals,
	tapBehavior: new(...args: readonly never[]) => object,
): void {
	const nextTap = extractTapHandler(nextNode.props);
	const nextRef = extractRefHandle(nextNode.props);
	const nextProps = buildNodeProps(nextNode);
	if (nextTap) {
		nextProps.active = true;
	}
	else if (previous.tapInstalled && !Object.hasOwn(nextProps, "active")) {
		nextProps.active = false;
	}

	applyProps(previous.content as Dictionary, previous.props, nextProps);
	assignTapHandler(previous.content, nextTap);
	updateRefBinding(previous, nextRef);

	if (isContainerType(nextNode.type)) {
		const nextElements = extractElementChildren(nextNode);
		previous.children = patchChildren(
			previous.content as PiuContainer,
			previous.children,
			nextElements,
			globals,
			tapBehavior,
		);
	}

	previous.key = extractNodeKey(nextNode.props);
	previous.props = nextProps;
	previous.tapInstalled = previous.tapInstalled || Boolean(nextTap);
}

function patchChildren(
	container: PiuContainer,
	previousChildren: readonly RenderedNodeState[],
	nextElements: readonly ElementNode[],
	globals: PiuGlobals,
	tapBehavior: new(...args: readonly never[]) => object,
): RenderedNodeState[] {
	if (!supportsFineGrainedMutation(container))
		return replaceAllChildren(container, previousChildren, nextElements, globals, tapBehavior);

	if (previousChildren.length === nextElements.length) {
		let fastPath = true;
		for (let index = 0; index < nextElements.length; index += 1) {
			const previous = previousChildren[index];
			const next = nextElements[index];
			if (!previous || !next) {
				fastPath = false;
				break;
			}
			if ((previous.key !== null) || (extractNodeKey(next.props) !== null) || !canPatchInPlace(previous, next)) {
				fastPath = false;
				break;
			}
		}
		if (fastPath) {
			const nextChildren = previousChildren as RenderedNodeState[];
			for (let index = 0; index < nextChildren.length; index += 1) {
				const previous = nextChildren[index];
				const next = nextElements[index];
				if (!previous || !next)
					continue;
				patchRenderedNode(previous, next, globals, tapBehavior);
			}
			return nextChildren;
		}
	}

	const keyedPool = new Map<NodeKey, RenderedNodeState[]>();
	const unkeyedPool: RenderedNodeState[] = [];
	for (const child of previousChildren) {
		if (child.key === null) {
			unkeyedPool.push(child);
			continue;
		}
		const bucket = keyedPool.get(child.key);
		if (bucket)
			bucket.push(child);
		else
			keyedPool.set(child.key, [child]);
	}

	const reused = new Set<RenderedNodeState>();
	const nextChildren: RenderedNodeState[] = [];

	for (const nextElement of nextElements) {
		const nextKey = extractNodeKey(nextElement.props);
		let candidate: RenderedNodeState | null = null;

		if (nextKey !== null) {
			const bucket = keyedPool.get(nextKey);
			while (bucket && bucket.length > 0) {
				const maybe = bucket.shift()!;
				if (reused.has(maybe))
					continue;
				if (!canPatchInPlace(maybe, nextElement))
					continue;
				candidate = maybe;
				break;
			}
		}
		else {
			while (unkeyedPool.length > 0) {
				const maybe = unkeyedPool.shift()!;
				if (reused.has(maybe))
					continue;
				if (!canPatchInPlace(maybe, nextElement))
					continue;
				candidate = maybe;
				break;
			}
		}

		if (candidate) {
			reused.add(candidate);
			patchRenderedNode(candidate, nextElement, globals, tapBehavior);
			nextChildren.push(candidate);
			continue;
		}

		nextChildren.push(createRenderedNode(nextElement, globals, tapBehavior));
	}

	for (const child of previousChildren) {
		if (reused.has(child))
			continue;
		disposeRenderedNode(child);
		container.remove(child.content);
	}

	reorderChildren(container, nextChildren);
	return nextChildren;
}

export function mountPiuApplication(
	view: () => ElementNode,
	options: MountPiuOptions = {},
): MountedPiuApplication {
	const taskQueue = options.taskQueue ?? createDefaultTaskQueue();
	const preferredDriver = options.driver ?? nativeRuntimeDriver;
	const providedApplication = options.application ?? null;
	let application = providedApplication;
	let renderedTree: RenderedTree | null = null;
	let driverSession: RuntimeDriverSession | null = null;
	let globals: PiuGlobals | null = null;
	let tapBehavior: (new(...args: readonly never[]) => object) | null = null;
	let disposeEffect: Unsubscribe | null = null;
	let disposed = false;
	let queued = false;
	let pendingRoot: ElementNode | null = null;

	const ensureRendererDependencies = (): { globals: PiuGlobals; tapBehavior: new(...args: readonly never[]) => object } => {
		if (!globals)
			globals = getPiuGlobals();
		if (!tapBehavior)
			tapBehavior = createTapBehavior(globals, taskQueue);
		return { globals, tapBehavior };
	};

	const render = (root: ElementNode): void => {
		if (root.type !== "application")
			throw new Error("Root node must be <application>.");
		const deps = ensureRendererDependencies();

		const nextRootProps = sanitizeProps(root.props as Dictionary, RESERVED_KEYS);

		if (!application)
			application = new deps.globals.Application(null, nextRootProps) as PiuApplication;

		applyProps(application as Dictionary, renderedTree?.rootProps ?? {}, nextRootProps);
		if (!renderedTree && providedApplication)
			application.empty();

		const nextElements = extractElementChildren(root);
		const nextChildren = patchChildren(
			application,
			renderedTree?.children ?? [],
			nextElements,
			deps.globals,
			deps.tapBehavior,
		);
		renderedTree = {
			rootProps: nextRootProps,
			children: nextChildren,
		};
	};

	const applyRoot = (root: ElementNode): void => {
		if (driverSession) {
			driverSession.update(root);
			return;
		}
		render(root);
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
			applyRoot(next);
		});
	};

	const initialRoot = view();
	if (preferredDriver) {
		driverSession = preferredDriver.mount(initialRoot, {
			application: providedApplication ?? undefined,
			taskQueue,
		});
		if (driverSession)
			application = driverSession.application as PiuApplication;
		else
			render(initialRoot);
	}
	else {
		render(initialRoot);
	}

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
			driverSession?.dispose();
			driverSession = null;
			if (renderedTree) {
				for (const child of renderedTree.children)
					disposeRenderedNode(child);
				renderedTree = null;
				application?.empty();
			}
		},
	};
}
