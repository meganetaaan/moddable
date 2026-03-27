export const BACKENDS = Object.freeze({
	ANTHROPIC: "anthropic",
	OPENAI: "openai",
	OPENROUTER: "openrouter",
	OLLAMA: "ollama",
});

export const CHANNEL_RX_BUF_SIZE = 512;
export const CHANNEL_TX_BUF_SIZE = 1024;
export const TOOL_RESULT_BUF_SIZE = 512;
export const BOOT_OK_TASK_STACK_SIZE = 4096;
export const TELEGRAM_OUTPUT_QUEUE_LENGTH = 4;
export const TELEGRAM_MAX_MSG_LEN = 4096;
export const MAX_HISTORY_TURNS = 12;
export const MAX_TOOL_ROUNDS = 5;
export const TELEGRAM_POLL_TIMEOUT = 30;
export const TELEGRAM_POLL_TIMEOUT_OPENROUTER = 8;
export const TELEGRAM_POLL_TIMEOUT_ESP32 = 5;
export const TELEGRAM_MAX_ALLOWED_CHAT_IDS = 4;
export const SLACK_MAX_ALLOWED_USER_IDS = 4;
export const START_COMMAND_COOLDOWN_MS = 30000;
export const MESSAGE_REPLAY_COOLDOWN_MS = 20000;

export const LLM_API_KEY_MAX_LEN = 511;
export const LLM_API_KEY_BUF_SIZE = LLM_API_KEY_MAX_LEN + 1;
export const LLM_AUTH_HEADER_BUF_SIZE = "Bearer ".length + LLM_API_KEY_MAX_LEN + 1;
export const LLM_MAX_TOKENS = 1024;
export const LLM_MAX_RETRIES = 3;
export const LLM_RETRY_BASE_MS = 2000;
export const LLM_RETRY_MAX_MS = 10000;
export const LLM_RETRY_BUDGET_MS = 45000;
export const RATELIMIT_MAX_PER_HOUR = 100;
export const RATELIMIT_MAX_PER_DAY = 1000;
export const RATELIMIT_ENABLED = true;
export const MAX_DYNAMIC_TOOLS = 8;
export const TOOL_NAME_MAX_LEN = 24;
export const TOOL_DESC_MAX_LEN = 128;
export const CRON_MAX_ACTION_LEN = 256;
export const CRON_MAX_ENTRIES = 16;
export const TIMEZONE_MAX_LEN = 64;
export const NVS_MAX_KEY_LEN = 15;
export const NVS_MAX_VALUE_LEN = 512;
export const DEFAULT_TIMEZONE_POSIX = "UTC0";
export const USER_MEMORY_KEY_PREFIX = "u_";
export const WIFI_STA_SSID_MAX_BYTES = 32;
export const WIFI_STA_PASS_MAX_BYTES = 63;
export const WIFI_STA_PASS_MIN_BYTES = 8;

export const SYSTEM_PROMPT =
	"You are zclaw, an AI agent running on an ESP32 microcontroller. " +
	"You have 400KB of RAM and run on bare metal with FreeRTOS. " +
	"You can create and run custom tools, control GPIO pins, store persistent memories, and set schedules. " +
	"You run on the device itself, not as a separate cloud session. " +
	"Be concise - you're on a tiny chip. " +
	"Return plain text only. Do not use markdown, code fences, bullet lists, backticks, bold, italics, or headings. " +
	"Use your tools to control hardware, remember things, and automate tasks. " +
	"When summarizing capabilities, prioritize custom tools, schedules, memory, and GPIO before optional i2c_scan details. " +
	"When asked for all or multiple GPIO states, prefer one gpio_read_all call instead of repeated gpio_read calls. " +
	"If users explicitly ask to view or change persona/tone settings, use set_persona/get_persona/reset_persona tools. " +
	"Persona is a persistent device setting on this ESP32 and survives reboot until changed or reset. " +
	"Do not change persona based on ambiguous wording or casual chat. " +
	"When asked what is currently saved/set on the device, use tools to verify instead of guessing. " +
	"Users can create custom tools with create_tool. When you call a custom tool, you'll receive an action to execute - carry it out using your built-in tools.";
