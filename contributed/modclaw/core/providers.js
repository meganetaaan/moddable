import {BACKENDS, LLM_MAX_TOKENS} from "./config.js";
import {
	buildAnthropicToolDefinitions,
	buildOpenAIToolDefinitions,
} from "./tools.js";

function historyHasPriorToolUse(history, index, toolId) {
	if (!toolId)
		return false;
	for (let i = 0; i < index; i++) {
		const entry = history[i];
		if (entry.isToolUse && entry.toolId === toolId)
			return true;
	}
	return false;
}

function parseArguments(content) {
	if ((null === content) || (undefined === content))
		return {};
	if ("string" === typeof content) {
		try {
			return JSON.parse(content);
		}
		catch {
			return {};
		}
	}
	return content;
}

function serializeArguments(content) {
	if ("string" === typeof content)
		return content;
	return JSON.stringify(content ?? {});
}

export function isOpenAIFormat(backend) {
	return backend === BACKENDS.OPENAI || backend === BACKENDS.OPENROUTER || backend === BACKENDS.OLLAMA;
}

export function openAITokenLimitField(backend, model) {
	if (backend === BACKENDS.OPENAI && String(model ?? "").startsWith("gpt-5"))
		return "max_completion_tokens";
	return "max_tokens";
}

export function buildAnthropicRequest({
	model,
	systemPrompt,
	history = [],
	userMessage = "",
	userTools = [],
}) {
	const request = {
		model,
		max_tokens: LLM_MAX_TOKENS,
		system: systemPrompt,
		messages: [],
		tools: buildAnthropicToolDefinitions(userTools),
	};

	for (let index = 0; index < history.length; index++) {
		const entry = history[index];
		const message = {role: entry.role};
		if (entry.isToolUse) {
			message.content = [{
				type: "tool_use",
				id: entry.toolId,
				name: entry.toolName,
				input: parseArguments(entry.content),
			}];
		}
		else if (entry.isToolResult) {
			if (!historyHasPriorToolUse(history, index, entry.toolId))
				continue;
			message.content = [{
				type: "tool_result",
				tool_use_id: entry.toolId,
				content: entry.content,
			}];
		}
		else {
			message.content = entry.content;
		}
		request.messages.push(message);
	}

	if (userMessage)
		request.messages.push({role: "user", content: userMessage});

	return request;
}

export function buildOpenAIRequest({
	backend = BACKENDS.OPENAI,
	model,
	systemPrompt,
	history = [],
	userMessage = "",
	userTools = [],
}) {
	const request = {
		model,
		messages: [{role: "system", content: systemPrompt}],
		tools: buildOpenAIToolDefinitions(userTools),
	};
	request[openAITokenLimitField(backend, model)] = LLM_MAX_TOKENS;

	for (let index = 0; index < history.length; index++) {
		const entry = history[index];
		if (entry.isToolUse) {
			request.messages.push({
				role: "assistant",
				content: null,
				tool_calls: [{
					id: entry.toolId,
					type: "function",
					function: {
						name: entry.toolName,
						arguments: serializeArguments(entry.content),
					},
				}],
			});
		}
		else if (entry.isToolResult) {
			if (!historyHasPriorToolUse(history, index, entry.toolId))
				continue;
			request.messages.push({
				role: "tool",
				tool_call_id: entry.toolId,
				content: entry.content,
			});
		}
		else {
			request.messages.push({role: entry.role, content: entry.content});
		}
	}

	if (userMessage)
		request.messages.push({role: "user", content: userMessage});

	return request;
}

export function buildProviderRequest(options) {
	return isOpenAIFormat(options.backend)
		? buildOpenAIRequest(options)
		: buildAnthropicRequest(options);
}

export function parseAnthropicResponse(response) {
	const result = {text: "", toolName: "", toolId: "", toolInput: null};
	for (const block of response?.content ?? []) {
		if ("text" === block?.type)
			result.text = block.text ?? "";
		else if ("tool_use" === block?.type) {
			result.toolName = block.name ?? "";
			result.toolId = block.id ?? "";
			result.toolInput = block.input ?? null;
		}
	}
	return result;
}

export function parseOpenAIResponse(response) {
	const result = {text: "", toolName: "", toolId: "", toolInput: null};
	const message = response?.choices?.[0]?.message;
	if (!message)
		return result;

	if ("string" === typeof message.content)
		result.text = message.content;

	const toolCall = message.tool_calls?.[0];
	if (toolCall) {
		result.toolId = toolCall.id ?? "";
		result.toolName = toolCall.function?.name ?? "";
		if ("string" === typeof toolCall.function?.arguments) {
			try {
				result.toolInput = JSON.parse(toolCall.function.arguments);
			}
			catch {
				result.toolInput = {};
			}
		}
	}

	return result;
}

export function parseProviderResponse(backend, response) {
	return isOpenAIFormat(backend)
		? parseOpenAIResponse(response)
		: parseAnthropicResponse(response);
}
