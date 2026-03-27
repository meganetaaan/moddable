import Preference from "preference";
import Timer from "timer";
import Net from "net";
import WiFi from "wifi";

import {
	bootGuardGetPersistedCount,
	bootGuardNextCount,
	bootGuardSetPersistedCount,
	bootGuardShouldEnterSafeMode,
} from "./bootGuard.js";
import {createManagedZclawRuntime} from "./managedRuntime.js";
import {LocalAdminAction} from "./localAdmin.js";
import {PreferenceMap} from "./preferenceMap.js";
import {RequestTransport} from "./requestTransport.js";
import {WiFiService} from "./wifiService.js";

const MAX_BOOT_FAILURES = 4;
const BOOT_SUCCESS_DELAY_MS = 30000;

function restartSystem() {
	globalThis.System?.restart?.();
}

function createTimerAdapter(timerModule = Timer) {
	return {
		set(callback, delay = 0) {
			return timerModule.set(callback, delay);
		},
		repeat(callback, interval) {
			return timerModule.repeat(callback, interval);
		},
		clear(id) {
			timerModule.clear(id);
		},
	};
}

export function createLiveZclawApp(options = {}) {
	const rawStore = options.rawStore ?? new PreferenceMap({
		preference: options.preference ?? Preference,
		domain: options.storageDomain ?? "zclaw",
	});
	const timer = options.timer ?? createTimerAdapter(options.Timer ?? Timer);
	const transport = options.transport ?? new RequestTransport(options.transportOptions);
	const maxBootFailures = options.maxBootFailures ?? MAX_BOOT_FAILURES;
	const currentBootCount = bootGuardGetPersistedCount(rawStore);
	const safeMode = bootGuardShouldEnterSafeMode(currentBootCount, maxBootFailures);
	bootGuardSetPersistedCount(rawStore, bootGuardNextCount(currentBootCount));
	const wifi = options.wifi ?? new WiFiService({
		WiFi: options.WiFi ?? WiFi,
		Net: options.Net ?? Net,
		timer,
		store: rawStore,
	});
	const deviceConfigured = wifi.isProvisioned();
	let bootOkTimerId = 0;

	const localAdminOptions = {
		bootGuard: {
			getPersistedCount() {
				return bootGuardGetPersistedCount(rawStore);
			},
		},
		async wifiStatusProvider() {
			return wifi.statusText({safeMode, provisioned: deviceConfigured});
		},
		async wifiScanProvider() {
			return wifi.scanText();
		},
		flags: {
			isSafeMode() {
				return safeMode;
			},
			isDeviceConfigured() {
				return deviceConfigured;
			},
		},
		maxBootFailures,
		async onAction(action) {
			if (action === LocalAdminAction.REBOOT) {
				if (options.systemActions?.restart)
					await options.systemActions.restart();
				else
					restartSystem();
				return;
			}
			if (action === LocalAdminAction.FACTORY_RESET_REBOOT) {
				rawStore.clear?.();
				await options.systemActions?.factoryReset?.();
				if (options.systemActions?.restart)
					await options.systemActions.restart();
				else
					restartSystem();
			}
		},
		...(options.localAdminOptions ?? {}),
	};

	const app = createManagedZclawRuntime({
		...options,
		rawStore,
		timer,
		transport,
		localAdminOptions,
		system: options.system ?? {
			version: options.version ?? "m5stack_cores3",
			now() {
				return new Date();
			},
			timeSynced() {
				return true;
			},
			health() {
				return safeMode
					? "Health: safe_mode=yes"
					: `Health: safe_mode=no wifi_provisioned=${deviceConfigured ? "yes" : "no"}`;
			},
			diagnostics(input = {}) {
				const level = String(input.level ?? "normal");
				const scope = String(input.scope ?? "system");
				return [
					`Diagnostics scope=${scope} level=${level}`,
					wifi.statusText({safeMode, provisioned: deviceConfigured}),
					`Boot count=${bootGuardGetPersistedCount(rawStore)} safe_mode=${safeMode ? "yes" : "no"}`,
				].join("\n");
			},
		},
		timeSynced: options.timeSynced ?? true,
	});

	return {
		...app,
		wifi,
		safeMode,
		deviceConfigured,
		async start() {
			if (safeMode || !deviceConfigured) {
				return {
					safeMode,
					deviceConfigured,
					wifiConnected: false,
					telegramConfigured: false,
					slackConfigured: false,
				};
			}

			const wifiConnected = await wifi.connectFromStore();
			const started = app.start();
			bootOkTimerId = timer.set(() => {
				bootGuardSetPersistedCount(rawStore, 0);
				bootOkTimerId = 0;
			}, options.bootSuccessDelayMs ?? BOOT_SUCCESS_DELAY_MS);

			if (wifiConnected && app.telegram.isConfigured() && (options.sendStartupMessage !== false))
				await app.telegram.send("I'm back online. What can I help you with?");

			return {
				...started,
				safeMode,
				deviceConfigured,
				wifiConnected,
			};
		},
		stop() {
			if (bootOkTimerId) {
				timer.clear(bootOkTimerId);
				bootOkTimerId = 0;
			}
			wifi.close();
			app.stop();
		},
	};
}
