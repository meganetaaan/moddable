export const LIMITS = Object.freeze({
	channelRxBufferSize: 512,
	channelTxBufferSize: 1024,
	toolResultBufferSize: 512,
	maxHistoryTurns: 12,
	maxToolRounds: 5,
	nvsMaxKeyLength: 15,
	nvsMaxValueLength: 512,
	timezoneMaxLength: 64,
	cronMaxEntries: 16,
	cronMaxActionLength: 256,
	maxDynamicTools: 8,
	toolNameMaxLength: 24,
	toolDescriptionMaxLength: 128,
});

export const USER_MEMORY_KEY_PREFIX = "u_";

export const DEFAULT_TIMEZONE_POSIX = "UTC0";

export const TIMEZONE_ALIASES = Object.freeze({
	UTC: "UTC0",
	"Etc/UTC": "UTC0",
	GMT: "UTC0",
	"America/Los_Angeles": "PST8PDT,M3.2.0/2,M11.1.0/2",
	"US/Pacific": "PST8PDT,M3.2.0/2,M11.1.0/2",
	PST: "PST8PDT,M3.2.0/2,M11.1.0/2",
	PDT: "PST8PDT,M3.2.0/2,M11.1.0/2",
	PT: "PST8PDT,M3.2.0/2,M11.1.0/2",
	"America/Denver": "MST7MDT,M3.2.0/2,M11.1.0/2",
	"US/Mountain": "MST7MDT,M3.2.0/2,M11.1.0/2",
	MST: "MST7MDT,M3.2.0/2,M11.1.0/2",
	MDT: "MST7MDT,M3.2.0/2,M11.1.0/2",
	MT: "MST7MDT,M3.2.0/2,M11.1.0/2",
	"America/Chicago": "CST6CDT,M3.2.0/2,M11.1.0/2",
	"US/Central": "CST6CDT,M3.2.0/2,M11.1.0/2",
	CST: "CST6CDT,M3.2.0/2,M11.1.0/2",
	CDT: "CST6CDT,M3.2.0/2,M11.1.0/2",
	CT: "CST6CDT,M3.2.0/2,M11.1.0/2",
	"America/New_York": "EST5EDT,M3.2.0/2,M11.1.0/2",
	"US/Eastern": "EST5EDT,M3.2.0/2,M11.1.0/2",
	EST: "EST5EDT,M3.2.0/2,M11.1.0/2",
	EDT: "EST5EDT,M3.2.0/2,M11.1.0/2",
	ET: "EST5EDT,M3.2.0/2,M11.1.0/2",
});

export const SENSITIVE_MEMORY_KEYS = Object.freeze([
	"api_key",
	"tg_token",
	"tg_chat_id",
	"tg_chat_ids",
	"wifi_pass",
	"llm_backend",
	"llm_model",
	"llm_api_url",
	"wifi_ssid",
]);

export const BUILTIN_TOOLS = Object.freeze([
	{
		name: "gpio_write",
		description: "Set a GPIO pin HIGH or LOW. Controls LEDs, relays, outputs.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"pin\":{\"type\":\"integer\",\"description\":\"GPIO pin allowed by GPIO Tool Safety policy\"},\"state\":{\"type\":\"integer\",\"description\":\"0=LOW, 1=HIGH\"}},\"required\":[\"pin\",\"state\"]}",
	},
	{
		name: "gpio_read",
		description: "Read a GPIO pin state. Returns HIGH or LOW.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"pin\":{\"type\":\"integer\",\"description\":\"GPIO pin allowed by GPIO Tool Safety policy\"}},\"required\":[\"pin\"]}",
	},
	{
		name: "gpio_read_all",
		description: "Read all tool-allowed GPIO pin states in a single call. Use this when user asks for all GPIO states.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "delay",
		description: "Wait for specified milliseconds (max 60000). Use between GPIO operations.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"milliseconds\":{\"type\":\"integer\",\"description\":\"Time to wait in ms (max 60000)\"}},\"required\":[\"milliseconds\"]}",
	},
	{
		name: "i2c_scan",
		description: "Scan I2C bus for responding 7-bit addresses on selected SDA/SCL pins.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"sda_pin\":{\"type\":\"integer\",\"description\":\"GPIO pin for SDA (subject to GPIO Tool Safety policy)\"},\"scl_pin\":{\"type\":\"integer\",\"description\":\"GPIO pin for SCL (subject to GPIO Tool Safety policy)\"},\"frequency_hz\":{\"type\":\"integer\",\"description\":\"I2C bus speed in Hz (optional, default 100000)\"}},\"required\":[\"sda_pin\",\"scl_pin\"]}",
	},
	{
		name: "memory_set",
		description: "Store a value in persistent user memory. Key must start with u_.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"key\":{\"type\":\"string\",\"description\":\"User key (max 15 chars, must start with u_)\"},\"value\":{\"type\":\"string\",\"description\":\"Value to store\"}},\"required\":[\"key\",\"value\"]}",
	},
	{
		name: "memory_get",
		description: "Retrieve a value from persistent user memory. Key must start with u_.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"key\":{\"type\":\"string\",\"description\":\"User key to retrieve (must start with u_)\"}},\"required\":[\"key\"]}",
	},
	{
		name: "memory_list",
		description: "List all user memory keys (u_*).",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "memory_delete",
		description: "Delete a key from persistent user memory. Key must start with u_.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"key\":{\"type\":\"string\",\"description\":\"User key to delete (must start with u_)\"}},\"required\":[\"key\"]}",
	},
	{
		name: "set_persona",
		description: "Set assistant tone persona. Call only when the user explicitly asks to change persona/tone settings. Affects wording only, never tool or safety behavior.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"persona\":{\"type\":\"string\",\"enum\":[\"neutral\",\"friendly\",\"technical\",\"witty\"],\"description\":\"Persona name\"}},\"required\":[\"persona\"]}",
	},
	{
		name: "get_persona",
		description: "Get current assistant tone persona. Use when user asks which persona is active.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "reset_persona",
		description: "Reset assistant tone persona back to neutral. Call only when user explicitly asks to reset persona/tone settings.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "cron_set",
		description: "Create a scheduled task. Type 'periodic' runs every N minutes. Type 'daily' runs at a specific local time in the device timezone (see set_timezone/get_timezone). Type 'once' runs one time after N minutes.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"type\":{\"type\":\"string\",\"enum\":[\"periodic\",\"daily\",\"once\"]},\"interval_minutes\":{\"type\":\"integer\",\"description\":\"For periodic: minutes between runs\"},\"delay_minutes\":{\"type\":\"integer\",\"description\":\"For once: minutes from now before one-time run\"},\"hour\":{\"type\":\"integer\",\"description\":\"For daily: hour 0-23\"},\"minute\":{\"type\":\"integer\",\"description\":\"For daily: minute 0-59\"},\"action\":{\"type\":\"string\",\"description\":\"What to do when triggered\"}},\"required\":[\"type\",\"action\"]}",
	},
	{
		name: "cron_list",
		description: "List all scheduled tasks.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "cron_delete",
		description: "Delete a scheduled task by ID.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"id\":{\"type\":\"integer\",\"description\":\"Schedule ID to delete\"}},\"required\":[\"id\"]}",
	},
	{
		name: "get_time",
		description: "Get current date and time in the configured device timezone.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "set_timezone",
		description: "Set device timezone used by get_time and daily cron schedules. Accepts common aliases (UTC, America/Los_Angeles, America/Denver, America/Chicago, America/New_York) or a POSIX TZ string.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"timezone\":{\"type\":\"string\",\"description\":\"Timezone alias or POSIX TZ string\"}},\"required\":[\"timezone\"]}",
	},
	{
		name: "get_timezone",
		description: "Get current device timezone (POSIX string and abbreviation).",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "get_version",
		description: "Get current firmware version.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "get_health",
		description: "Get device health status: heap memory, rate limits, time sync, version.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "get_diagnostics",
		description: "Get detailed runtime diagnostics. Optional scope: quick, runtime, memory, rates, time, all. Optional verbose=true for expanded output.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"scope\":{\"type\":\"string\",\"enum\":[\"quick\",\"runtime\",\"memory\",\"rates\",\"time\",\"all\"],\"description\":\"Optional diagnostics scope (default quick)\"},\"verbose\":{\"type\":\"boolean\",\"description\":\"Include extra details (default false)\"}}}",
	},
	{
		name: "create_tool",
		description: "Create a custom tool. Provide a short name (no spaces), brief description, and the action to perform when called.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Tool name (alphanumeric, no spaces)\"},\"description\":{\"type\":\"string\",\"description\":\"Short description for tool list\"},\"action\":{\"type\":\"string\",\"description\":\"What to do when tool is called\"}},\"required\":[\"name\",\"description\",\"action\"]}",
	},
	{
		name: "list_user_tools",
		description: "List all user-created custom tools.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{}}",
	},
	{
		name: "delete_user_tool",
		description: "Delete a user-created custom tool by name.",
		inputSchemaJSON: "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Tool name to delete\"}},\"required\":[\"name\"]}",
	},
]);
