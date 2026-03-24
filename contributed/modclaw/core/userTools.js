import {
	CRON_MAX_ACTION_LEN,
	MAX_DYNAMIC_TOOLS,
	TOOL_DESC_MAX_LEN,
	TOOL_NAME_MAX_LEN,
} from "./config.js";
import {hasBuiltinTool} from "./tools.js";

function sanitizeTool(tool) {
	return {
		name: String(tool.name ?? "").slice(0, TOOL_NAME_MAX_LEN - 1),
		description: String(tool.description ?? "").slice(0, TOOL_DESC_MAX_LEN - 1),
		action: String(tool.action ?? "").slice(0, CRON_MAX_ACTION_LEN - 1),
	};
}

export function userToolNameIsValid(name) {
	return "string" === typeof name && /^[A-Za-z0-9_]+$/.test(name);
}

export class UserToolRegistry {
	constructor(options = {}) {
		this.maxTools = options.maxTools ?? MAX_DYNAMIC_TOOLS;
		this.tools = [];
		for (const tool of options.tools ?? []) {
			const sanitized = sanitizeTool(tool);
			if (this.recordIsValid(sanitized) && !this.find(sanitized.name))
				this.tools.push(sanitized);
		}
	}

	recordIsValid(tool) {
		return userToolNameIsValid(tool?.name) &&
			Boolean(tool.description) &&
			Boolean(tool.action) &&
			!hasBuiltinTool(tool.name);
	}

	create(name, description, action) {
		const tool = sanitizeTool({name, description, action});
		if (!this.recordIsValid(tool))
			return false;
		if (this.find(tool.name))
			return false;
		if (this.tools.length >= this.maxTools)
			return false;
		this.tools.push(tool);
		return true;
	}

	delete(name) {
		const index = this.tools.findIndex(tool => tool.name === name);
		if (index < 0)
			return false;
		this.tools.splice(index, 1);
		return true;
	}

	getAll(maxCount = this.tools.length) {
		return this.tools.slice(0, maxCount).map(tool => ({...tool}));
	}

	find(name) {
		const found = this.tools.find(tool => tool.name === name);
		return found ? {...found} : null;
	}

	count() {
		return this.tools.length;
	}

	listText() {
		if (!this.tools.length)
			return "No user tools defined";
		const lines = [`User tools (${this.tools.length}):`];
		for (const tool of this.tools)
			lines.push(`  ${tool.name} - ${tool.description}`);
		return lines.join("\n");
	}
}
