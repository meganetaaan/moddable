import {
	WIFI_STA_PASS_MAX_BYTES,
	WIFI_STA_PASS_MIN_BYTES,
	WIFI_STA_SSID_MAX_BYTES,
} from "./config.js";

function errorResult(message) {
	return {ok: false, error: message};
}

export function validateWiFiCredentials(ssid, pass) {
	if (("string" !== typeof ssid) || ("string" !== typeof pass))
		return errorResult("WiFi credentials missing");

	if (!ssid.length)
		return errorResult("WiFi SSID is required");
	if (ssid.length > WIFI_STA_SSID_MAX_BYTES)
		return errorResult("WiFi SSID exceeds 32 bytes");
	if (pass.length > WIFI_STA_PASS_MAX_BYTES)
		return errorResult("WiFi password exceeds 63 characters");
	if (pass.length && (pass.length < WIFI_STA_PASS_MIN_BYTES))
		return errorResult("WiFi password must be 8-63 characters or empty for open network");

	return {ok: true, error: ""};
}

export function copyWiFiCredentialsToSTAConfig(ssid, pass) {
	const ssidOut = new Uint8Array(WIFI_STA_SSID_MAX_BYTES);
	const passOut = new Uint8Array(WIFI_STA_PASS_MAX_BYTES + 1);

	if (("string" !== typeof ssid) || ("string" !== typeof pass))
		return {ssid: ssidOut, pass: passOut};

	const ssidLength = Math.min(ssid.length, WIFI_STA_SSID_MAX_BYTES);
	const passLength = Math.min(pass.length, WIFI_STA_PASS_MAX_BYTES);

	for (let i = 0; i < ssidLength; i++)
		ssidOut[i] = ssid.charCodeAt(i) & 0xff;
	for (let i = 0; i < passLength; i++)
		passOut[i] = pass.charCodeAt(i) & 0xff;

	return {ssid: ssidOut, pass: passOut};
}
