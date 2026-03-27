import config from "mc/config";
import Preference from "preference";

const STORAGE_DOMAIN = "zclaw";

function readPreference(key) {
	return Preference.get(STORAGE_DOMAIN, key);
}

function hasPreference(key) {
	const value = readPreference(key);
	return (undefined !== value) && (null !== value) && ("" !== String(value));
}

function writePreference(key, value) {
	if ((undefined === value) || (null === value))
		return;
	Preference.set(STORAGE_DOMAIN, key, String(value));
}

function writePreferenceIfMissing(key, value) {
	if (hasPreference(key))
		return;
	writePreference(key, value);
}

function parseConfigFlag(value, fallback = false) {
	if ((undefined === value) || (null === value))
		return fallback;
	if ("boolean" === typeof value)
		return value;
	const text = String(value).trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(text))
		return true;
	if (["0", "false", "no", "off"].includes(text))
		return false;
	return fallback;
}

function seedSimulatorPreferences({LLM_BACKENDS, NVS_KEYS}) {
	const openAIKey = config.openAIKey ?? config.apiKey ?? null;
	const llmBackend = config.llmBackend ?? config.backend ?? (openAIKey ? LLM_BACKENDS.OPENAI : null);
	const preserveBootCount = parseConfigFlag(config.preserveBootCount ?? config.keepBootCount, false);

	if (llmBackend)
		writePreference(NVS_KEYS.LLM_BACKEND, llmBackend);
	if (openAIKey)
		writePreference(NVS_KEYS.API_KEY, openAIKey);
	if (config.llmModel)
		writePreference(NVS_KEYS.LLM_MODEL, config.llmModel);
	if (config.llmApiUrl)
		writePreference(NVS_KEYS.LLM_API_URL, config.llmApiUrl);
	if (config.telegramToken)
		writePreference(NVS_KEYS.TG_TOKEN, config.telegramToken);
	if (config.telegramChatId)
		writePreference(NVS_KEYS.TG_CHAT_ID, config.telegramChatId);
	if (config.slackToken)
		writePreference(NVS_KEYS.SLACK_TOKEN, config.slackToken);
	if (config.slackUserIds)
		writePreference(NVS_KEYS.SLACK_USER_IDS, config.slackUserIds);
	if (!preserveBootCount)
		writePreference(NVS_KEYS.BOOT_COUNT, "0");

	writePreferenceIfMissing(NVS_KEYS.WIFI_SSID, config.wifiSSID ?? "lin-sim");
	if (!hasPreference(NVS_KEYS.WIFI_PASS))
		writePreference(NVS_KEYS.WIFI_PASS, config.wifiPassword ?? "");

	trace(
		`zclaw lin seed backend=${readPreference(NVS_KEYS.LLM_BACKEND) ?? "unset"} ` +
		`wifi_ssid=${readPreference(NVS_KEYS.WIFI_SSID) ?? "unset"} ` +
		`api_key=${hasPreference(NVS_KEYS.API_KEY) ? "yes" : "no"} ` +
		`slack=${hasPreference(NVS_KEYS.SLACK_TOKEN) && hasPreference(NVS_KEYS.SLACK_USER_IDS) ? "yes" : "no"} ` +
		`boot_count=${readPreference(NVS_KEYS.BOOT_COUNT) ?? "unset"}\n`
	);
}

async function boot() {
	try {
		const [{LLM_BACKENDS, NVS_KEYS}, {createLiveZclawApp}] = await Promise.all([
			import("zclaw/config"),
			import("zclaw/liveApp"),
		]);

		seedSimulatorPreferences({LLM_BACKENDS, NVS_KEYS});

		const zclaw = createLiveZclawApp({
			version: "lin-simulator",
		});
		globalThis.zclaw = zclaw;

		const result = await zclaw.start();
		trace(
			`zclaw live runtime started ` +
			`(safe_mode=${result.safeMode ? "yes" : "no"} ` +
			`configured=${result.deviceConfigured ? "yes" : "no"} ` +
			`wifi_connected=${result.wifiConnected ? "yes" : "no"} ` +
			`telegram_configured=${result.telegramConfigured ? "yes" : "no"} ` +
			`slack_configured=${result.slackConfigured ? "yes" : "no"})\n`
		);
	}
	catch (error) {
		trace(`zclaw bootstrap failed: ${error}\n`);
		if (error?.stack)
			trace(`${error.stack}\n`);
	}
}

boot();
