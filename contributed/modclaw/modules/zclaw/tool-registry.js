import {BUILTIN_TOOLS} from "./constants.js";

export class ToolRegistry {
	#tools;

	constructor(tools = BUILTIN_TOOLS) {
		this.#tools = tools.map(tool => Object.freeze({...tool}));
	}

	getAll() {
		return this.#tools.slice();
	}

	find(name) {
		return this.#tools.find(tool => tool.name === name) ?? null;
	}

	has(name) {
		return !!this.find(name);
	}
}

export function createBuiltinToolRegistry() {
	return new ToolRegistry();
}
