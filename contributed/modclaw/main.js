import {createLiveZclawApp} from "./modules/liveApp.js";

const zclaw = createLiveZclawApp();
globalThis.zclaw = zclaw;
Promise.resolve(zclaw.start())
	.then(result => {
		trace(`zclaw live runtime started (safe_mode=${result.safeMode ? "yes" : "no"} configured=${result.deviceConfigured ? "yes" : "no"} wifi_connected=${result.wifiConnected ? "yes" : "no"})\n`);
	})
	.catch(error => {
		trace(`zclaw startup failed: ${error}\n`);
	});
