/*---
description:
flags: [module]
---*/

import {
	WIFI_STA_PASS_MAX_BYTES,
	WIFI_STA_SSID_MAX_BYTES,
} from "../../../contributed/modclaw/modules/config.js";
import {
	copyWiFiCredentialsToSTAConfig,
	validateWiFiCredentials,
} from "../../../contributed/modclaw/modules/wifiCredentials.js";

const maxSSID = "s".repeat(WIFI_STA_SSID_MAX_BYTES);
const maxPass = "p".repeat(WIFI_STA_PASS_MAX_BYTES);

let result = validateWiFiCredentials(maxSSID, maxPass);
assert.sameValue(true, result.ok);
result = validateWiFiCredentials("MyNetwork", "");
assert.sameValue(true, result.ok);

result = validateWiFiCredentials("x".repeat(WIFI_STA_SSID_MAX_BYTES + 1), "password123");
assert.sameValue(false, result.ok);
assert(result.error.includes("SSID"));

result = validateWiFiCredentials("MyNetwork", "y".repeat(WIFI_STA_PASS_MAX_BYTES + 1));
assert.sameValue(false, result.ok);
assert(result.error.includes("password"));

result = validateWiFiCredentials("MyNetwork", "short7!");
assert.sameValue(false, result.ok);
assert(result.error.includes("8-63"));

const copied = copyWiFiCredentialsToSTAConfig("a".repeat(WIFI_STA_SSID_MAX_BYTES), "b".repeat(WIFI_STA_PASS_MAX_BYTES));
for (let i = 0; i < WIFI_STA_SSID_MAX_BYTES; i++)
	assert.sameValue("a".charCodeAt(0), copied.ssid[i]);
for (let i = 0; i < WIFI_STA_PASS_MAX_BYTES; i++)
	assert.sameValue("b".charCodeAt(0), copied.pass[i]);
assert.sameValue(0, copied.pass[WIFI_STA_PASS_MAX_BYTES]);
