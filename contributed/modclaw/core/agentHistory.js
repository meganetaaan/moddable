import {MAX_HISTORY_TURNS} from "./config.js";

function cloneEntry(entry) {
	return {
		role: entry.role,
		content: entry.content,
		isToolUse: Boolean(entry.isToolUse),
		isToolResult: Boolean(entry.isToolResult),
		toolId: entry.toolId ?? "",
		toolName: entry.toolName ?? "",
	};
}

export class ConversationHistory {
	constructor(options = {}) {
		this.maxEntries = (options.maxTurns ?? MAX_HISTORY_TURNS) * 2;
		this.entries = [];
	}

	reset() {
		this.entries.length = 0;
	}

	mark() {
		return this.entries.length;
	}

	rollback(marker) {
		if (!Number.isInteger(marker) || marker < 0 || marker > this.entries.length)
			return;
		if (marker === this.entries.length)
			return;
		this.entries.length = marker;
	}

	#push(entry) {
		if (this.entries.length >= this.maxEntries)
			this.entries.shift();
		this.entries.push(entry);
	}

	addUser(text) {
		this.#push(cloneEntry({role: "user", content: text}));
	}

	addAssistant(text) {
		this.#push(cloneEntry({role: "assistant", content: text}));
	}

	addToolUse({toolId = "", toolName = "", input = {}}) {
		this.#push(cloneEntry({
			role: "assistant",
			content: input,
			isToolUse: true,
			toolId,
			toolName,
		}));
	}

	addToolResult({toolId = "", text = ""}) {
		this.#push(cloneEntry({
			role: "user",
			content: text,
			isToolResult: true,
			toolId,
		}));
	}

	snapshot() {
		return this.entries.map(cloneEntry);
	}
}
