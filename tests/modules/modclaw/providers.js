/*---
description:
flags: [module]
---*/

import {
	buildBearerAuthHeader,
	buildRequest,
	copyApiKey,
	parseResponse,
	resolveBackendConfig,
} from "../../../contributed/modclaw/modules/providers.js";
import {LLM_BACKENDS} from "../../../contributed/modclaw/modules/config.js";
import {createToolRegistry} from "../../../contributed/modclaw/modules/toolRegistry.js";

const registry = createToolRegistry();
const tools = [registry.getBuiltin("gpio_write")];

assert.sameValue(copyApiKey("abc"), "abc");
assert.sameValue(copyApiKey(""), null);
assert.sameValue(copyApiKey("x".repeat(512)), null);
assert.sameValue(buildBearerAuthHeader("abc"), "Bearer abc");
assert.sameValue(buildBearerAuthHeader("abc", 8), null);

let config = resolveBackendConfig({backend: LLM_BACKENDS.ANTHROPIC});
assert.sameValue(config.backend, LLM_BACKENDS.ANTHROPIC);
assert.sameValue(config.apiUrl, "https://api.anthropic.com/v1/messages");
assert.sameValue(config.model, "claude-sonnet-4-6");
assert.sameValue(config.usesOpenAIFormat, false);

config = resolveBackendConfig({backend: "mystery_backend"});
assert.sameValue(config.backend, LLM_BACKENDS.OPENAI);
assert.sameValue(config.apiUrl, "https://api.openai.com/v1/responses");
assert.sameValue(config.model, "gpt-5.4");
assert.sameValue(config.usesOpenAIFormat, true);

let request = JSON.parse(buildRequest({
	backend: LLM_BACKENDS.ANTHROPIC,
	systemPrompt: "sys prompt",
	history: [],
	userMessage: "hello",
	tools,
}));
assert.sameValue(request.model, "claude-sonnet-4-6");
assert.sameValue(request.system, "sys prompt");
assert.sameValue(request.messages.length, 1);
assert.sameValue(request.tools.length, 1);
assert.sameValue(request.tools[0].name, "gpio_write");

request = JSON.parse(buildRequest({
	backend: LLM_BACKENDS.OPENAI,
	systemPrompt: "sys prompt",
	history: [],
	userMessage: "hello",
	tools,
}));
assert.sameValue(request.model, "gpt-5.4");
assert.sameValue(request.max_output_tokens, 1024);
assert.sameValue(request.instructions, "sys prompt");
assert.sameValue(request.messages, undefined);
assert.sameValue(request.input.length, 1);
assert.sameValue(request.input[0].role, "user");
assert.sameValue(request.tools[0].type, "function");
assert.sameValue(request.tools[0].name, "gpio_write");

request = JSON.parse(buildRequest({
	backend: LLM_BACKENDS.OPENROUTER,
	systemPrompt: "sys prompt",
	history: [],
	userMessage: "hello",
	tools,
}));
assert.sameValue(request.max_tokens, 1024);
assert.sameValue(request.max_completion_tokens, undefined);

request = JSON.parse(buildRequest({
	backend: LLM_BACKENDS.OPENAI,
	systemPrompt: "sys prompt",
	history: [
		{
			role: "user",
			content: "tool completed",
			isToolResult: true,
			toolId: "call_orphan",
		},
		{
			role: "user",
			content: "remember my name is Ted",
		},
	],
	tools,
}));
assert.sameValue(request.input.length, 1);
assert.sameValue(request.input[0].role, "user");
assert.sameValue(request.input[0].content, "remember my name is Ted");

request = JSON.parse(buildRequest({
	backend: LLM_BACKENDS.OPENAI,
	systemPrompt: "sys prompt",
	history: [
		{
			role: "assistant",
			content: {key: "name", value: "alice"},
			isToolUse: true,
			toolId: "call_123",
			toolName: "memory_set",
		},
		{
			role: "user",
			content: "stored",
			isToolResult: true,
			toolId: "call_123",
		},
	],
	tools,
}));
assert.sameValue(request.input.length, 2);
assert.sameValue(request.input[0].type, "function_call");
assert.sameValue(request.input[0].call_id, "call_123");
assert.sameValue(request.input[0].arguments, "{\"key\":\"name\",\"value\":\"alice\"}");
assert.sameValue(request.input[1].type, "function_call_output");
assert.sameValue(request.input[1].call_id, "call_123");
assert.sameValue(request.input[1].output, "stored");

let parsed = parseResponse({
	backend: LLM_BACKENDS.ANTHROPIC,
	responseText: "{\"content\":[{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"gpio_write\",\"input\":{\"pin\":10,\"state\":1}}]}",
});
assert.sameValue(parsed.toolName, "gpio_write");
assert.sameValue(parsed.toolId, "toolu_1");
assert.sameValue(parsed.toolInput.pin, 10);
assert.sameValue(parsed.toolInput.state, 1);

parsed = parseResponse({
	backend: LLM_BACKENDS.OPENAI,
	responseText: "{\"id\":\"resp_123\",\"output\":[{\"type\":\"function_call\",\"call_id\":\"call_abc\",\"name\":\"memory_set\",\"arguments\":\"{\\\"key\\\":\\\"name\\\",\\\"value\\\":\\\"alice\\\"}\"}]}",
});
assert.sameValue(parsed.toolName, "memory_set");
assert.sameValue(parsed.toolId, "call_abc");
assert.sameValue(parsed.toolInput.key, "name");
assert.sameValue(parsed.toolInput.value, "alice");

parsed = parseResponse({
	backend: LLM_BACKENDS.OPENAI,
	responseText: "{\"id\":\"resp_124\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"hello from responses\"}]}]}",
});
assert.sameValue(parsed.text, "hello from responses");
assert.sameValue(parsed.toolName, "");
assert.sameValue(parsed.toolId, "");

parsed = parseResponse({
	backend: LLM_BACKENDS.OPENAI,
	responseText: "{\"error\":{\"message\":\"Invalid API key\"}}",
});
assert(parsed.text.includes("Invalid API key"));
assert.sameValue(parsed.toolName, "");
assert.sameValue(parsed.toolId, "");
assert.sameValue(parsed.toolInput, null);
