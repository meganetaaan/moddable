import {
	LLM_API_KEY_MAX_LENGTH,
	LLM_API_URLS,
	LLM_AUTH_HEADER_MAX_LENGTH,
	LLM_BACKENDS,
	LLM_DEFAULT_MODELS,
	LLM_MAX_TOKENS,
} from "./config.js";

function normalizeBackend(value) {
	return Object.values(LLM_BACKENDS).includes(value) ? value : LLM_BACKENDS.OPENAI;
}

function hasPriorToolUse(history, index, toolId) {
	if (!toolId)
		return false;
	for (let i = 0; i < index; i += 1) {
		const item = history[i];
		if (item.isToolUse && (item.toolId === toolId))
			return true;
	}
	return false;
}

function parseSchema(schemaJson) {
	if (!schemaJson)
		return {};
	return JSON.parse(schemaJson);
}

function toAnthropicMessages(history, userMessage) {
	const messages = [];

	history.forEach((message, index) => {
		const entry = {role: message.role};
		if (message.isToolUse) {
			entry.content = [{
				type: "tool_use",
				id: message.toolId,
				name: message.toolName,
				input: JSON.parse(message.content || "{}"),
			}];
			messages.push(entry);
			return;
		}

		if (message.isToolResult) {
			if (!hasPriorToolUse(history, index, message.toolId))
				return;
			entry.content = [{
				type: "tool_result",
				tool_use_id: message.toolId,
				content: message.content,
			}];
			messages.push(entry);
			return;
		}

		entry.content = message.content;
		messages.push(entry);
	});

	if (userMessage)
		messages.push({role: "user", content: userMessage});

	return messages;
}

function toOpenAIMessages(history, userMessage, systemPrompt) {
	const messages = [{role: "system", content: systemPrompt}];

	history.forEach((message, index) => {
		if (message.isToolUse) {
			messages.push({
				role: "assistant",
				content: null,
				tool_calls: [{
					id: message.toolId,
					type: "function",
					function: {
						name: message.toolName,
						arguments: message.content || "{}",
					},
				}],
			});
			return;
		}

		if (message.isToolResult) {
			if (!hasPriorToolUse(history, index, message.toolId))
				return;
			messages.push({
				role: "tool",
				tool_call_id: message.toolId,
				content: message.content,
			});
			return;
		}

		messages.push({
			role: message.role,
			content: message.content,
		});
	});

	if (userMessage)
		messages.push({role: "user", content: userMessage});

	return messages;
}

function toAnthropicTools(tools) {
	return tools.map(tool => ({
		name: tool.name,
		description: tool.description,
		input_schema: parseSchema(tool.inputSchemaJson),
	}));
}

function toOpenAITools(tools) {
	return tools.map(tool => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: parseSchema(tool.inputSchemaJson),
		},
	}));
}

function buildAnthropicRequest(options) {
	const request = {
		model: options.model,
		max_tokens: LLM_MAX_TOKENS,
		system: options.systemPrompt,
		messages: toAnthropicMessages(options.history, options.userMessage),
	};

	if (options.tools.length)
		request.tools = toAnthropicTools(options.tools);

	return JSON.stringify(request);
}

function buildOpenAIRequest(options) {
	const request = {
		model: options.model,
		messages: toOpenAIMessages(options.history, options.userMessage, options.systemPrompt),
		tools: options.tools.length ? toOpenAITools(options.tools) : undefined,
	};

	if (options.backend === LLM_BACKENDS.OPENAI)
		request.max_completion_tokens = LLM_MAX_TOKENS;
	else
		request.max_tokens = LLM_MAX_TOKENS;

	return JSON.stringify(request);
}

function parseAnthropicResponse(root) {
	let text = "";
	let toolName = "";
	let toolId = "";
	let toolInput = null;

	for (const block of root.content ?? []) {
		if (block.type === "text")
			text = block.text ?? text;
		else if (block.type === "tool_use") {
			toolName = block.name ?? "";
			toolId = block.id ?? "";
			toolInput = block.input ?? null;
		}
	}

	return {text, toolName, toolId, toolInput};
}

function parseOpenAIResponse(root) {
	const message = root?.choices?.[0]?.message ?? {};
	const toolCall = message.tool_calls?.[0];
	let toolInput = null;
	if (toolCall?.function?.arguments)
		toolInput = JSON.parse(toolCall.function.arguments);
	return {
		text: message.content ?? "",
		toolName: toolCall?.function?.name ?? "",
		toolId: toolCall?.id ?? "",
		toolInput,
	};
}

export function copyApiKey(apiKey, maxLength = LLM_API_KEY_MAX_LENGTH) {
	if (("string" !== typeof apiKey) || !apiKey || (apiKey.length > maxLength))
		return null;
	return apiKey;
}

export function buildBearerAuthHeader(apiKey, maxLength = LLM_AUTH_HEADER_MAX_LENGTH) {
	const copied = copyApiKey(apiKey);
	if (!copied)
		return null;
	const header = `Bearer ${copied}`;
	return (header.length <= maxLength) ? header : null;
}

export function resolveBackendConfig(options = {}) {
	const backend = normalizeBackend(options.backend);
	return Object.freeze({
		backend,
		apiUrl: options.apiUrlOverride || LLM_API_URLS[backend],
		model: options.model || LLM_DEFAULT_MODELS[backend],
		apiKey: options.apiKey ?? null,
		usesOpenAIFormat: backend !== LLM_BACKENDS.ANTHROPIC,
	});
}

export function buildRequest(options) {
	const tools = options.tools ?? [];
	const config = resolveBackendConfig(options);
	const requestOptions = {
		backend: config.backend,
		model: config.model,
		systemPrompt: options.systemPrompt,
		history: options.history ?? [],
		userMessage: options.userMessage ?? "",
		tools,
	};

	return (config.backend === LLM_BACKENDS.ANTHROPIC)
		? buildAnthropicRequest(requestOptions)
		: buildOpenAIRequest(requestOptions);
}

export function parseResponse(options) {
	const root = JSON.parse(options.responseText);
	if (root?.error?.message) {
		return {
			text: `API error: ${root.error.message}`,
			toolName: "",
			toolId: "",
			toolInput: null,
		};
	}

	const backend = normalizeBackend(options.backend);
	return (backend === LLM_BACKENDS.ANTHROPIC)
		? parseAnthropicResponse(root)
		: parseOpenAIResponse(root);
}
