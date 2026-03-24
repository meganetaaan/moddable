import {LIMITS} from "./constants.js";
import {validateStringInput} from "./validate.js";

function isValidToolName(name) {
	return /^[A-Za-z0-9_]+$/.test(name);
}

export class UserToolStore {
	#registry;
	#tools = [];

	constructor({registry}) {
		this.#registry = registry;
	}

	create(name, description, action) {
		const validatedName = String(name ?? "");
		if (!validatedName || !isValidToolName(validatedName) || (validatedName.length >= LIMITS.toolNameMaxLength))
			throw new Error("Error: invalid tool name");
		if (this.#registry?.has(validatedName))
			throw new Error(`Error: tool '${validatedName}' conflicts with built-in tool`);
		if (this.#tools.some(tool => tool.name === validatedName))
			throw new Error(`Error: tool '${validatedName}' already exists`);
		if (this.#tools.length >= LIMITS.maxDynamicTools)
			throw new Error(`Error: max user tools reached (${LIMITS.maxDynamicTools})`);

		const validatedDescription = validateStringInput(description, LIMITS.toolDescriptionMaxLength - 1);
		const validatedAction = validateStringInput(action, LIMITS.cronMaxActionLength - 1);
		if (!validatedDescription.length || !validatedAction.length)
			throw new Error("Error: description and action must be non-empty");

		this.#tools.push(Object.freeze({
			name: validatedName,
			description: validatedDescription,
			action: validatedAction,
		}));
		return `Created tool: ${validatedName}`;
	}

	delete(name) {
		const index = this.#tools.findIndex(tool => tool.name === name);
		if (index < 0)
			return false;
		this.#tools.splice(index, 1);
		return true;
	}

	list() {
		return this.#tools.slice();
	}

	find(name) {
		return this.#tools.find(tool => tool.name === name) ?? null;
	}
}
