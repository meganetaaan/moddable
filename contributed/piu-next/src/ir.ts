export interface TextNode {
	readonly kind: "text";
	readonly value: string;
}

export interface ElementNode {
	readonly kind: "element";
	readonly type: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly children: readonly ChildNode[];
}

export type ChildNode = TextNode | ElementNode;
export type NodeFactoryResult = ElementNode | readonly ChildNode[];

export type ChildInput =
	| ChildNode
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly ChildInput[];

export type NodeFactory = (
	props: Readonly<Record<string, unknown>> | null,
	...children: readonly ChildInput[]
) => ChildInput;

function isTextNode(value: unknown): value is TextNode {
	if (typeof value !== "object" || value === null)
		return false;
	return (value as { kind?: unknown }).kind === "text";
}

function isElementNode(value: unknown): value is ElementNode {
	if (typeof value !== "object" || value === null)
		return false;
	return (value as { kind?: unknown }).kind === "element";
}

function normalizeChildren(inputs: readonly ChildInput[], output: ChildNode[]): void {
	for (const input of inputs) {
		if ((input === null) || (input === undefined) || (typeof input === "boolean"))
			continue;
		if (typeof input === "string" || typeof input === "number") {
			output.push(text(input));
			continue;
		}
		if (Array.isArray(input)) {
			normalizeChildren(input, output);
			continue;
		}
		if (isTextNode(input) || isElementNode(input)) {
			output.push(input);
			continue;
		}
		throw new TypeError("Unsupported child input");
	}
}

export function text(value: string | number): TextNode {
	return {
		kind: "text",
		value: String(value),
	};
}

export function fragment(_props: Record<string, never> | null, ...children: readonly ChildInput[]): readonly ChildInput[] {
	return children;
}

export function node(
	type: string,
	props: Readonly<Record<string, unknown>> | null,
	...children: readonly ChildInput[]
): ElementNode;
export function node(
	type: NodeFactory,
	props: Readonly<Record<string, unknown>> | null,
	...children: readonly ChildInput[]
): readonly ChildNode[];
export function node(
	type: string | NodeFactory,
	props: Readonly<Record<string, unknown>> | null,
	...children: readonly ChildInput[]
): NodeFactoryResult {
	if (typeof type === "function") {
		const produced = type(props, ...children);
		const normalizedChildren: ChildNode[] = [];
		normalizeChildren([produced], normalizedChildren);
		return normalizedChildren;
	}
	const normalizedChildren: ChildNode[] = [];
	normalizeChildren(children, normalizedChildren);
	return {
		kind: "element",
		type,
		props: props ?? {},
		children: normalizedChildren,
	};
}
