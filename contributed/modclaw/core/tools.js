function schema(properties = {}, required = []) {
	const value = {type: "object", properties};
	if (required.length)
		value.required = required;
	return value;
}

export const BUILTIN_TOOLS = Object.freeze([
	{
		name: "gpio_write",
		description: "Set a GPIO pin HIGH or LOW. Controls LEDs, relays, outputs.",
		inputSchema: schema({
			pin: {type: "integer", description: "GPIO pin allowed by GPIO Tool Safety policy"},
			state: {type: "integer", description: "0=LOW, 1=HIGH"},
		}, ["pin", "state"]),
	},
	{
		name: "gpio_read",
		description: "Read a GPIO pin state. Returns HIGH or LOW.",
		inputSchema: schema({
			pin: {type: "integer", description: "GPIO pin allowed by GPIO Tool Safety policy"},
		}, ["pin"]),
	},
	{
		name: "gpio_read_all",
		description: "Read all tool-allowed GPIO pin states in a single call. Use this when user asks for all GPIO states.",
		inputSchema: schema(),
	},
	{
		name: "delay",
		description: "Wait for specified milliseconds (max 60000). Use between GPIO operations.",
		inputSchema: schema({
			milliseconds: {type: "integer", description: "Time to wait in ms (max 60000)"},
		}, ["milliseconds"]),
	},
	{
		name: "i2c_scan",
		description: "Scan I2C bus for responding 7-bit addresses on selected SDA/SCL pins.",
		inputSchema: schema({
			sda_pin: {type: "integer", description: "GPIO pin for SDA (subject to GPIO Tool Safety policy)"},
			scl_pin: {type: "integer", description: "GPIO pin for SCL (subject to GPIO Tool Safety policy)"},
			frequency_hz: {type: "integer", description: "I2C bus speed in Hz (optional, default 100000)"},
		}, ["sda_pin", "scl_pin"]),
	},
	{
		name: "memory_set",
		description: "Store a value in persistent user memory. Key must start with u_.",
		inputSchema: schema({
			key: {type: "string", description: "User key (max 15 chars, must start with u_)"},
			value: {type: "string", description: "Value to store"},
		}, ["key", "value"]),
	},
	{
		name: "memory_get",
		description: "Retrieve a value from persistent user memory. Key must start with u_.",
		inputSchema: schema({
			key: {type: "string", description: "User key to retrieve (must start with u_)"},
		}, ["key"]),
	},
	{
		name: "memory_list",
		description: "List all user memory keys (u_*).",
		inputSchema: schema(),
	},
	{
		name: "memory_delete",
		description: "Delete a key from persistent user memory. Key must start with u_.",
		inputSchema: schema({
			key: {type: "string", description: "User key to delete (must start with u_)"},
		}, ["key"]),
	},
	{
		name: "set_persona",
		description: "Set assistant tone persona. Call only when the user explicitly asks to change persona/tone settings. Affects wording only, never tool or safety behavior.",
		inputSchema: schema({
			persona: {type: "string", enum: ["neutral", "friendly", "technical", "witty"], description: "Persona name"},
		}, ["persona"]),
	},
	{
		name: "get_persona",
		description: "Get current assistant tone persona. Use when user asks which persona is active.",
		inputSchema: schema(),
	},
	{
		name: "reset_persona",
		description: "Reset assistant tone persona back to neutral. Call only when user explicitly asks to reset persona/tone settings.",
		inputSchema: schema(),
	},
	{
		name: "cron_set",
		description: "Create a scheduled task. Type 'periodic' runs every N minutes. Type 'daily' runs at a specific local time in the device timezone (see set_timezone/get_timezone). Type 'once' runs one time after N minutes.",
		inputSchema: schema({
			type: {type: "string", enum: ["periodic", "daily", "once"]},
			interval_minutes: {type: "integer", description: "For periodic: minutes between runs"},
			delay_minutes: {type: "integer", description: "For once: minutes from now before one-time run"},
			hour: {type: "integer", description: "For daily: hour 0-23"},
			minute: {type: "integer", description: "For daily: minute 0-59"},
			action: {type: "string", description: "What to do when triggered"},
		}, ["type", "action"]),
	},
	{
		name: "cron_list",
		description: "List all scheduled tasks.",
		inputSchema: schema(),
	},
	{
		name: "cron_delete",
		description: "Delete a scheduled task by ID.",
		inputSchema: schema({
			id: {type: "integer", description: "Schedule ID to delete"},
		}, ["id"]),
	},
	{
		name: "get_time",
		description: "Get current date and time in the configured device timezone.",
		inputSchema: schema(),
	},
	{
		name: "set_timezone",
		description: "Set device timezone used by get_time and daily cron schedules. Accepts common aliases (UTC, America/Los_Angeles, America/Denver, America/Chicago, America/New_York) or a POSIX TZ string.",
		inputSchema: schema({
			timezone: {type: "string", description: "Timezone alias or POSIX TZ string"},
		}, ["timezone"]),
	},
	{
		name: "get_timezone",
		description: "Get current device timezone (POSIX string and abbreviation).",
		inputSchema: schema(),
	},
	{
		name: "get_version",
		description: "Get current firmware version.",
		inputSchema: schema(),
	},
	{
		name: "get_health",
		description: "Get device health status: heap memory, rate limits, time sync, version.",
		inputSchema: schema(),
	},
	{
		name: "get_diagnostics",
		description: "Get detailed runtime diagnostics. Optional scope: quick, runtime, memory, rates, time, all. Optional verbose=true for expanded output.",
		inputSchema: schema({
			scope: {
				type: "string",
				enum: ["quick", "runtime", "memory", "rates", "time", "all"],
				description: "Optional diagnostics scope (default quick)",
			},
			verbose: {type: "boolean", description: "Include extra details (default false)"},
		}),
	},
	{
		name: "create_tool",
		description: "Create a custom tool. Provide a short name (no spaces), brief description, and the action to perform when called.",
		inputSchema: schema({
			name: {type: "string", description: "Tool name (alphanumeric, no spaces)"},
			description: {type: "string", description: "Short description for tool list"},
			action: {type: "string", description: "What to do when tool is called"},
		}, ["name", "description", "action"]),
	},
	{
		name: "list_user_tools",
		description: "List all user-created custom tools.",
		inputSchema: schema(),
	},
	{
		name: "delete_user_tool",
		description: "Delete a user-created custom tool by name.",
		inputSchema: schema({
			name: {type: "string", description: "Tool name to delete"},
		}, ["name"]),
	},
]);

export function getBuiltinTool(name) {
	return BUILTIN_TOOLS.find(tool => tool.name === name) ?? null;
}

export function hasBuiltinTool(name) {
	return null !== getBuiltinTool(name);
}

export function buildAnthropicToolDefinitions(userTools = []) {
	const builtins = BUILTIN_TOOLS.map(tool => ({
		name: tool.name,
		description: tool.description,
		input_schema: tool.inputSchema,
	}));
	const custom = userTools.map(tool => ({
		name: tool.name,
		description: tool.description,
		input_schema: schema(),
	}));
	return builtins.concat(custom);
}

export function buildOpenAIToolDefinitions(userTools = []) {
	const builtins = BUILTIN_TOOLS.map(tool => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema,
		},
	}));
	const custom = userTools.map(tool => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: schema(),
		},
	}));
	return builtins.concat(custom);
}
