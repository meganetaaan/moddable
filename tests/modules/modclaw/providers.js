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
assert.sameValue(config.apiUrl, "https://api.openai.com/v1/chat/completions");
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
assert.sameValue(request.max_completion_tokens, 1024);
assert.sameValue(request.max_tokens, undefined);
assert.sameValue(request.messages.length, 2);
assert.sameValue(request.messages[0].role, "system");
assert.sameValue(request.tools[0].type, "function");

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
assert.sameValue(request.messages.length, 2);
assert.sameValue(request.messages[0].role, "system");
assert.sameValue(request.messages[1].content, "remember my name is Ted");

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
	responseText: "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":null,\"tool_calls\":[{\"id\":\"call_abc\",\"type\":\"function\",\"function\":{\"name\":\"memory_set\",\"arguments\":\"{\\\"key\\\":\\\"name\\\",\\\"value\\\":\\\"alice\\\"}\"}}]}}]}",
});
assert.sameValue(parsed.toolName, "memory_set");
assert.sameValue(parsed.toolId, "call_abc");
assert.sameValue(parsed.toolInput.key, "name");
assert.sameValue(parsed.toolInput.value, "alice");

parsed = parseResponse({
	backend: LLM_BACKENDS.OPENAI,
	responseText: "{\"error\":{\"message\":\"Invalid API key\"}}",
});
assert(parsed.text.includes("Invalid API key"));
assert.sameValue(parsed.toolName, "");
assert.sameValue(parsed.toolId, "");
assert.sameValue(parsed.toolInput, null);
