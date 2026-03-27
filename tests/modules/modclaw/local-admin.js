/*---
description:
flags: [module]
---*/

import {
	LocalAdminAction,
	LocalAdminController,
} from "../../../contributed/modclaw/modules/localAdmin.js";

const admin = new LocalAdminController({
	bootGuard: {getPersistedCount() { return 3; }},
	wifiStatusProvider() {
		return "WiFi status: provisioned=yes safe_mode=no driver=started link=connected ssid=Trident ip=10.0.0.24 rssi=-77 last_reason=none";
	},
	wifiScanProvider() {
		return "WiFi scan: 2 APs visible";
	},
	flags: {
		isSafeMode() { return true; },
		isDeviceConfigured() { return true; },
	},
});

assert.sameValue(true, admin.isCommand("/wifi status"));
assert.sameValue(false, admin.isCommand("/hello"));

let response = admin.handle("/wifi status");
assert.sameValue(true, response.ok);
assert(response.text.includes("ssid=Trident"));

response = admin.handle("/wifi scan");
assert.sameValue(true, response.ok);
assert(response.text.includes("2 APs"));

response = admin.handle("/bootcount");
assert.sameValue(true, response.ok);
assert(response.text.includes("persisted=3"));
assert(response.text.includes("safe_mode=yes"));

response = admin.handle("/factory-reset");
assert.sameValue(true, response.ok);
assert(response.text.includes("Run /factory-reset confirm"));
assert.sameValue(LocalAdminAction.NONE, response.action);

response = admin.handle("/factory-reset confirm");
assert.sameValue(true, response.ok);
assert.sameValue(LocalAdminAction.FACTORY_RESET_REBOOT, response.action);

response = admin.handle("/reboot");
assert.sameValue(true, response.ok);
assert.sameValue("Rebooting...", response.text);
assert.sameValue(LocalAdminAction.REBOOT, response.action);

response = admin.handle("/wifi status extra");
assert.sameValue(false, response.ok);
assert(response.text.includes("at most one argument"));
