const BUILTIN_TOOLS = Object.freeze([
	{
		name: "gpio_write",
		description: "Set a GPIO pin HIGH or LOW. Controls LEDs, relays, outputs.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"pin\":{\"type\":\"integer\",\"description\":\"GPIO pin allowed by GPIO Tool Safety policy\"},\"state\":{\"type\":\"integer\",\"description\":\"0=LOW, 1=HIGH\"}},\"required\":[\"pin\",\"state\"]}",
	},
	{
		name: "gpio_read",
		description: "Read a GPIO pin state. Returns HIGH or LOW.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"pin\":{\"type\":\"integer\",\"description\":\"GPIO pin allowed by GPIO Tool Safety policy\"}},\"required\":[\"pin\"]}",
	},
	{
		name: "gpio_read_all",
		description: "Read all tool-allowed GPIO pin states in a single call. Use this when user asks for all GPIO states.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "delay",
		description: "Wait for specified milliseconds (max 60000). Use between GPIO operations.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"milliseconds\":{\"type\":\"integer\",\"description\":\"Time to wait in ms (max 60000)\"}},\"required\":[\"milliseconds\"]}",
	},
	{
		name: "i2c_scan",
		description: "Scan I2C bus for responding 7-bit addresses on selected SDA/SCL pins.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"sda_pin\":{\"type\":\"integer\",\"description\":\"GPIO pin for SDA (subject to GPIO Tool Safety policy)\"},\"scl_pin\":{\"type\":\"integer\",\"description\":\"GPIO pin for SCL (subject to GPIO Tool Safety policy)\"},\"frequency_hz\":{\"type\":\"integer\",\"description\":\"I2C bus speed in Hz (optional, default 100000)\"}},\"required\":[\"sda_pin\",\"scl_pin\"]}",
	},
	{
		name: "memory_set",
		description: "Store a value in persistent user memory. Key must start with u_.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"key\":{\"type\":\"string\",\"description\":\"User key (max 15 chars, must start with u_)\"},\"value\":{\"type\":\"string\",\"description\":\"Value to store\"}},\"required\":[\"key\",\"value\"]}",
	},
	{
		name: "memory_get",
		description: "Retrieve a value from persistent user memory. Key must start with u_.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"key\":{\"type\":\"string\",\"description\":\"User key to retrieve (must start with u_)\"}},\"required\":[\"key\"]}",
	},
	{
		name: "memory_list",
		description: "List all user memory keys (u_*).",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "memory_delete",
		description: "Delete a key from persistent user memory. Key must start with u_.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"key\":{\"type\":\"string\",\"description\":\"User key to delete (must start with u_)\"}},\"required\":[\"key\"]}",
	},
	{
		name: "set_persona",
		description: "Set assistant tone persona. Call only when the user explicitly asks to change persona/tone settings. Affects wording only, never tool or safety behavior.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"persona\":{\"type\":\"string\",\"enum\":[\"neutral\",\"friendly\",\"technical\",\"witty\"],\"description\":\"Persona name\"}},\"required\":[\"persona\"]}",
	},
	{
		name: "get_persona",
		description: "Get current assistant tone persona. Use when user asks which persona is active.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "reset_persona",
		description: "Reset assistant tone persona back to neutral. Call only when user explicitly asks to reset persona/tone settings.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "cron_set",
		description: "Create a scheduled task. Type 'periodic' runs every N minutes. Type 'daily' runs at a specific local time in the device timezone (see set_timezone/get_timezone). Type 'once' runs one time after N minutes.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"type\":{\"type\":\"string\",\"enum\":[\"periodic\",\"daily\",\"once\"]},\"interval_minutes\":{\"type\":\"integer\",\"description\":\"For periodic: minutes between runs\"},\"delay_minutes\":{\"type\":\"integer\",\"description\":\"For once: minutes from now before one-time run\"},\"hour\":{\"type\":\"integer\",\"description\":\"For daily: hour 0-23\"},\"minute\":{\"type\":\"integer\",\"description\":\"For daily: minute 0-59\"},\"action\":{\"type\":\"string\",\"description\":\"What to do when triggered\"}},\"required\":[\"type\",\"action\"]}",
	},
	{
		name: "cron_list",
		description: "List all scheduled tasks.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "cron_delete",
		description: "Delete a scheduled task by ID.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"id\":{\"type\":\"integer\",\"description\":\"Schedule ID to delete\"}},\"required\":[\"id\"]}",
	},
	{
		name: "get_time",
		description: "Get current date and time in the configured device timezone.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "set_timezone",
		description: "Set device timezone used by get_time and daily cron schedules. Accepts common aliases (UTC, America/Los_Angeles, America/Denver, America/Chicago, America/New_York) or a POSIX TZ string.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"timezone\":{\"type\":\"string\",\"description\":\"Timezone alias or POSIX TZ string\"}},\"required\":[\"timezone\"]}",
	},
	{
		name: "get_timezone",
		description: "Get current device timezone (POSIX string and abbreviation).",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "get_version",
		description: "Get current firmware version.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "get_health",
		description: "Get device health status: heap memory, rate limits, time sync, version.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "get_diagnostics",
		description: "Get detailed runtime diagnostics. Optional scope: quick, runtime, memory, rates, time, all. Optional verbose=true for expanded output.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"scope\":{\"type\":\"string\",\"enum\":[\"quick\",\"runtime\",\"memory\",\"rates\",\"time\",\"all\"],\"description\":\"Optional diagnostics scope (default quick)\"},\"verbose\":{\"type\":\"boolean\",\"description\":\"Include extra details (default false)\"}}}",
	},
	{
		name: "create_tool",
		description: "Create a custom tool. Provide a short name (no spaces), brief description, and the action to perform when called.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Tool name (alphanumeric, no spaces)\"},\"description\":{\"type\":\"string\",\"description\":\"Short description for tool list\"},\"action\":{\"type\":\"string\",\"description\":\"What to do when tool is called\"}},\"required\":[\"name\",\"description\",\"action\"]}",
	},
	{
		name: "list_user_tools",
		description: "List all user-created custom tools.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "delete_user_tool",
		description: "Delete a user-created custom tool by name.",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Tool name to delete\"}},\"required\":[\"name\"]}",
	},
]);

function cloneTool(tool) {
	return {
		name: tool.name,
		description: tool.description,
		inputSchemaJson: tool.inputSchemaJson,
	};
}

function assertUniqueTools(tools) {
	const names = new Set;
	for (const tool of tools) {
		if (!tool || ("string" !== typeof tool.name) || !tool.name)
			throw new TypeError("tool must have a non-empty name");
		if (names.has(tool.name))
			throw new RangeError(`duplicate tool '${tool.name}'`);
		names.add(tool.name);
	}
}

export {BUILTIN_TOOLS};

export function normalizeUserTool(tool) {
	if (!tool || ("string" !== typeof tool.name) || !tool.name)
		throw new TypeError("user tool must include a name");
	return {
		name: tool.name,
		description: tool.description ?? "",
		action: tool.action ?? "",
		inputSchemaJson: "{\"type\":\"object\",\"properties\":{}}",
	};
}

export function createToolRegistry(builtinTools = BUILTIN_TOOLS) {
	const builtins = builtinTools.map(cloneTool);
	assertUniqueTools(builtins);

	return Object.freeze({
		hasTool(name) {
			return builtins.some(tool => tool.name === name);
		},
		getBuiltin(name) {
			const tool = builtins.find(candidate => candidate.name === name);
			return tool ? cloneTool(tool) : null;
		},
		listBuiltins() {
			return builtins.map(cloneTool);
		},
		listAll(userTools = []) {
			const normalizedUserTools = userTools.map(normalizeUserTool);
			assertUniqueTools([...builtins, ...normalizedUserTools]);
			return [
				...builtins.map(cloneTool),
				...normalizedUserTools,
			];
		},
	});
}
