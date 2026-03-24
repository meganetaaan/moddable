/*---
description:
flags: [module]
---*/

import {
	BUILTIN_TOOLS,
	buildAnthropicToolDefinitions,
	buildOpenAIToolDefinitions,
	getBuiltinTool,
	hasBuiltinTool,
} from "../../../contributed/zclaw/core/tools.js";
import {UserToolRegistry, userToolNameIsValid} from "../../../contributed/zclaw/core/userTools.js";

assert(BUILTIN_TOOLS.length > 0);
assert(hasBuiltinTool("gpio_write"));
assert(hasBuiltinTool("memory_set"));
assert(hasBuiltinTool("cron_set"));
assert(hasBuiltinTool("get_diagnostics"));
assert(hasBuiltinTool("create_tool"));
assert(hasBuiltinTool("list_user_tools"));
assert(hasBuiltinTool("delete_user_tool"));
assert.sameValue(getBuiltinTool("gpio_write").name, "gpio_write");
assert.sameValue(getBuiltinTool("missing"), null);

assert(userToolNameIsValid("water_plants"));
assert(!userToolNameIsValid("water plants"));
assert(!userToolNameIsValid(""));

const registry = new UserToolRegistry;
assert(registry.create("water_plants", "Water the plants", "Turn GPIO 5 on then off"));
assert(!registry.create("water_plants", "Duplicate", "Nope"));
assert(!registry.create("gpio_write", "Conflict", "Nope"));
assert(!registry.create("with spaces", "Bad", "Nope"));
assert.sameValue(registry.count(), 1);
assert.sameValue(registry.find("water_plants").description, "Water the plants");
assert.sameValue(registry.listText(), "User tools (1):\n  water_plants - Water the plants");
assert(registry.delete("water_plants"));
assert(!registry.delete("water_plants"));
assert.sameValue(registry.listText(), "No user tools defined");

const limited = new UserToolRegistry({maxTools: 1});
assert(limited.create("tool_a", "A", "action"));
assert(!limited.create("tool_b", "B", "action"));

const anthropicTools = buildAnthropicToolDefinitions([
	{name: "custom_tool", description: "Custom", action: "Act"},
]);
assert.sameValue(anthropicTools.at(-1).name, "custom_tool");
assert.sameValue(anthropicTools.at(-1).input_schema.type, "object");

const openAITools = buildOpenAIToolDefinitions([
	{name: "custom_tool", description: "Custom", action: "Act"},
]);
assert.sameValue(openAITools.at(-1).type, "function");
assert.sameValue(openAITools.at(-1).function.name, "custom_tool");
assert.sameValue(openAITools.at(-1).function.parameters.type, "object");
