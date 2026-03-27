/*---
description:
flags: [module]
---*/

import {ToolRuntime} from "../../../contributed/modclaw/modules/toolRuntime.js";

const tools = new ToolRuntime({
	hardware: {
		gpioReadAll() {
			return {ok: true, text: "{\"pins\":{\"4\":1}}"};
		},
	},
	system: {
		version: "1.2.3",
		diagnostics() {
			return "diag text";
		},
		health() {
			return "health text";
		},
		now() {
			return new Date("2026-03-18T12:34:56Z");
		},
		timeSynced() {
			return true;
		},
	},
});

let result = tools.execute("memory_set", {key: "u_name", value: "lobster"});
assert.sameValue(true, result.ok);
assert.sameValue("Saved: u_name = lobster", result.text);
result = tools.execute("memory_get", {key: "u_name"});
assert.sameValue("u_name = lobster", result.text);

result = tools.execute("set_persona", {persona: "technical"});
assert.sameValue(true, result.ok);
assert(result.text.includes("Persona set to technical"));
result = tools.execute("get_persona", {});
assert(result.text.includes("Current persona: technical"));

result = tools.execute("cron_set", {
	type: "daily",
	hour: 8,
	minute: 15,
	action: "water plants",
});
assert.sameValue(true, result.ok);
assert(result.text.includes("Created schedule #1"));
result = tools.execute("cron_list", {});
assert(result.text.includes("water plants"));
result = tools.execute("get_timezone", {});
assert(result.text.includes("UTC0"));

result = tools.execute("create_tool", {
	name: "water_plants",
	description: "Water plants",
	action: "Turn GPIO 5 on",
});
assert.sameValue(true, result.ok);
assert.sameValue(true, Boolean(tools.findUserTool("water_plants")));
assert.sameValue(true, tools.list().some(tool => tool.name === "water_plants"));
result = tools.execute("list_user_tools", {});
assert(result.text.includes("water_plants"));
result = tools.execute("delete_user_tool", {name: "water_plants"});
assert(result.text.includes("Deleted tool 'water_plants'"));

result = tools.execute("get_version", {});
assert.sameValue("1.2.3", result.text);
result = tools.execute("get_diagnostics", {});
assert.sameValue("diag text", result.text);
result = tools.execute("get_health", {});
assert.sameValue("health text", result.text);
result = tools.execute("gpio_read_all", {});
assert.sameValue("{\"pins\":{\"4\":1}}", result.text);
