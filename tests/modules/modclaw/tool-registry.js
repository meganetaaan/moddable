/*---
description:
flags: [module]
---*/

import {
	BUILTIN_TOOLS,
	createToolRegistry,
	normalizeUserTool,
} from "../../../contributed/zclaw/modules/toolRegistry.js";

const registry = createToolRegistry();

assert(BUILTIN_TOOLS.length > 0);
assert(registry.hasTool("gpio_write"));
assert(registry.hasTool("memory_set"));
assert(registry.hasTool("cron_set"));
assert(registry.hasTool("get_diagnostics"));
assert(registry.hasTool("create_tool"));
assert(registry.hasTool("list_user_tools"));
assert(registry.hasTool("delete_user_tool"));

const builtinNames = registry.listBuiltins().map(tool => tool.name);
assert.sameValue(new Set(builtinNames).size, builtinNames.length);

const userTool = normalizeUserTool({
	name: "water_plants",
	description: "Runs a watering flow",
	action: "Turn GPIO 5 on, wait 30 seconds, turn it off",
});
assert.sameValue(userTool.name, "water_plants");
assert.sameValue(userTool.action, "Turn GPIO 5 on, wait 30 seconds, turn it off");

const allTools = registry.listAll([userTool]);
assert.sameValue(allTools.length, BUILTIN_TOOLS.length + 1);
assert.sameValue(allTools[allTools.length - 1].name, "water_plants");

assert.throws(RangeError, () => registry.listAll([{name: "gpio_write"}]));
