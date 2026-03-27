export const USER_MEMORY_KEY_PREFIX = "u_";
export const TELEGRAM_MAX_ALLOWED_CHAT_IDS = 4;
export const TELEGRAM_POLL_TIMEOUT = 30;
export const TELEGRAM_POLL_TIMEOUT_OPENROUTER = 8;
export const TELEGRAM_POLL_TIMEOUT_ESP32 = 5;
export const CRON_MAX_ENTRIES = 16;
export const SLACK_MAX_ALLOWED_USER_IDS = 4;
export const CRON_MAX_ACTION_LENGTH = 256;
export const TIMEZONE_MAX_LENGTH = 64;
export const DEFAULT_TIMEZONE = Object.freeze({
	posix: "UTC0",
	offsetMinutes: 0,
	abbreviation: "UTC",
});

export const LLM_BACKENDS = Object.freeze({
	ANTHROPIC: "anthropic",
	OPENAI: "openai",
	OPENROUTER: "openrouter",
	OLLAMA: "ollama",
});

export const LLM_API_URLS = Object.freeze({
	[LLM_BACKENDS.ANTHROPIC]: "https://api.anthropic.com/v1/messages",
	[LLM_BACKENDS.OPENAI]: "https://api.openai.com/v1/responses",
	[LLM_BACKENDS.OPENROUTER]: "https://openrouter.ai/api/v1/chat/completions",
	[LLM_BACKENDS.OLLAMA]: "http://127.0.0.1:11434/v1/chat/completions",
});

export const LLM_DEFAULT_MODELS = Object.freeze({
	[LLM_BACKENDS.ANTHROPIC]: "claude-sonnet-4-6",
	[LLM_BACKENDS.OPENAI]: "gpt-5.4",
	[LLM_BACKENDS.OPENROUTER]: "openrouter/auto",
	[LLM_BACKENDS.OLLAMA]: "qwen3:8b",
});

export const LLM_MAX_TOKENS = 1024;
export const LLM_API_KEY_MAX_LENGTH = 511;
export const LLM_API_KEY_BUF_SIZE = LLM_API_KEY_MAX_LENGTH + 1;
export const LLM_AUTH_HEADER_MAX_LENGTH = "Bearer ".length + LLM_API_KEY_MAX_LENGTH;
export const LLM_AUTH_HEADER_BUF_SIZE = LLM_AUTH_HEADER_MAX_LENGTH + 1;
export const CHANNEL_RX_BUF_SIZE = 512;
export const CHANNEL_TX_BUF_SIZE = 1024;
export const TOOL_RESULT_BUF_SIZE = 512;
export const BOOT_OK_TASK_STACK_SIZE = 4096;
export const TELEGRAM_MAX_MSG_LEN = 4096;
export const TELEGRAM_OUTPUT_QUEUE_LENGTH = 4;
export const WIFI_STA_SSID_MAX_BYTES = 32;
export const WIFI_STA_PASS_MAX_BYTES = 63;
export const WIFI_STA_PASS_MIN_BYTES = 8;

export const PERSONAS = Object.freeze([
	"neutral",
	"friendly",
	"technical",
	"witty",
]);

export const NVS_KEYS = Object.freeze({
	BOOT_COUNT: "boot_count",
	WIFI_SSID: "wifi_ssid",
	WIFI_PASS: "wifi_pass",
	LLM_BACKEND: "llm_backend",
	API_KEY: "api_key",
	LLM_MODEL: "llm_model",
	LLM_API_URL: "llm_api_url",
	TG_TOKEN: "tg_token",
	TG_CHAT_ID: "tg_chat_id",
	TG_CHAT_IDS: "tg_chat_ids",
	TG_OFFSET: "tg_offset",
	SLACK_TOKEN: "slack_token",
	SLACK_USER_IDS: "slack_user_ids",
	SLACK_STATE: "slack_state",
	TIMEZONE: "timezone",
	PERSONA: "persona",
	RL_DAILY: "rl_daily",
	RL_DAY: "rl_day",
	RL_YEAR: "rl_year",
});

export const SENSITIVE_KEYS = Object.freeze([
	NVS_KEYS.API_KEY,
	NVS_KEYS.TG_TOKEN,
	NVS_KEYS.TG_CHAT_ID,
	NVS_KEYS.TG_CHAT_IDS,
	NVS_KEYS.SLACK_TOKEN,
	NVS_KEYS.SLACK_USER_IDS,
	NVS_KEYS.WIFI_PASS,
	NVS_KEYS.LLM_BACKEND,
	NVS_KEYS.LLM_MODEL,
	NVS_KEYS.LLM_API_URL,
	NVS_KEYS.WIFI_SSID,
]);

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
