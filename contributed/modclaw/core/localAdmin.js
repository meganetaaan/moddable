import {commandPayload, isCommand} from "./commands.js";

export const LocalAdminAction = Object.freeze({
	NONE: "none",
	REBOOT: "reboot",
	FACTORY_RESET_REBOOT: "factory_reset_reboot",
});

function tokenizePayload(payload) {
	if (!payload)
		return [];
	return payload.split(/\s+/).filter(Boolean);
}

export class LocalAdminController {
	constructor(options = {}) {
		this.bootGuard = options.bootGuard ?? null;
		this.wifiStatusProvider = options.wifiStatusProvider ?? (() => "WiFi status: mock");
		this.wifiScanProvider = options.wifiScanProvider ?? (() => "WiFi scan: mock");
		this.flags = options.flags ?? {};
		this.maxBootFailures = options.maxBootFailures ?? 4;
		this.onAction = options.onAction ?? null;
		this.lastAction = LocalAdminAction.NONE;
	}

	isCommand(text) {
		return isCommand(text, "reboot") ||
			isCommand(text, "wifi") ||
			isCommand(text, "bootcount") ||
			isCommand(text, "factory-reset");
	}

	performAction(action) {
		this.lastAction = action ?? LocalAdminAction.NONE;
		if (this.onAction)
			this.onAction(this.lastAction);
	}

	async handleAsync(text) {
		if (isCommand(text, "wifi")) {
			const payload = commandPayload(text, "wifi");
			if (!payload || payload === "status") {
				return {
					ok: true,
					text: await Promise.resolve(this.wifiStatusProvider()),
					action: LocalAdminAction.NONE,
				};
			}
			if (payload.length >= 64)
				return {ok: false, text: "Error: /wifi arguments too long", action: LocalAdminAction.NONE};

			const tokens = tokenizePayload(payload);
			if (tokens.length > 1)
				return {ok: false, text: "Error: /wifi takes at most one argument", action: LocalAdminAction.NONE};
			if (!tokens.length || tokens[0] === "status") {
				return {
					ok: true,
					text: await Promise.resolve(this.wifiStatusProvider()),
					action: LocalAdminAction.NONE,
				};
			}
			if (tokens[0] === "scan") {
				return {
					ok: true,
					text: await Promise.resolve(this.wifiScanProvider()),
					action: LocalAdminAction.NONE,
				};
			}

			return {
				ok: false,
				text: `Error: unknown /wifi argument '${tokens[0]}' (use status or scan)`,
				action: LocalAdminAction.NONE,
			};
		}

		return this.handle(text);
	}

	handle(text) {
		if (isCommand(text, "reboot")) {
			const payload = commandPayload(text, "reboot");
			if (payload)
				return {ok: false, text: "Error: /reboot does not take arguments", action: LocalAdminAction.NONE};
			return {ok: true, text: "Rebooting...", action: LocalAdminAction.REBOOT};
		}

		if (isCommand(text, "bootcount")) {
			const payload = commandPayload(text, "bootcount");
			if (payload)
				return {ok: false, text: "Error: /bootcount does not take arguments", action: LocalAdminAction.NONE};

			const bootCount = this.bootGuard?.getPersistedCount?.() ?? 0;
			const remainingBeforeSafe = Math.max(0, this.maxBootFailures - bootCount);
			const safeMode = this.flags?.isSafeMode?.() ? "yes" : "no";
			const configured = this.flags?.isDeviceConfigured?.() ? "yes" : "no";
			return {
				ok: true,
				text:
					`Boot count: persisted=${bootCount} max_failures=${this.maxBootFailures} ` +
					`remaining_before_safe=${remainingBeforeSafe} safe_mode=${safeMode} configured=${configured}`,
				action: LocalAdminAction.NONE,
			};
		}

		if (isCommand(text, "factory-reset")) {
			const payload = commandPayload(text, "factory-reset");
			if (!payload) {
				return {
					ok: true,
					text: "Factory reset will erase WiFi credentials, tokens, schedules, memories, and boot state. Run /factory-reset confirm to continue.",
					action: LocalAdminAction.NONE,
				};
			}
			if (payload.length >= 64)
				return {ok: false, text: "Error: /factory-reset arguments too long", action: LocalAdminAction.NONE};

			const tokens = tokenizePayload(payload);
			if ((tokens.length !== 1) || (tokens[0] !== "confirm"))
				return {ok: false, text: "Error: use /factory-reset confirm", action: LocalAdminAction.NONE};

			return {
				ok: true,
				text: "Factory reset confirmed. Erasing NVS and rebooting...",
				action: LocalAdminAction.FACTORY_RESET_REBOOT,
			};
		}

		if (isCommand(text, "wifi")) {
			const payload = commandPayload(text, "wifi");
			if (!payload || payload === "status")
				return {ok: true, text: this.wifiStatusProvider(), action: LocalAdminAction.NONE};
			if (payload.length >= 64)
				return {ok: false, text: "Error: /wifi arguments too long", action: LocalAdminAction.NONE};

			const tokens = tokenizePayload(payload);
			if (tokens.length > 1)
				return {ok: false, text: "Error: /wifi takes at most one argument", action: LocalAdminAction.NONE};
			if (!tokens.length || tokens[0] === "status")
				return {ok: true, text: this.wifiStatusProvider(), action: LocalAdminAction.NONE};
			if (tokens[0] === "scan")
				return {ok: true, text: this.wifiScanProvider(), action: LocalAdminAction.NONE};

			return {
				ok: false,
				text: `Error: unknown /wifi argument '${tokens[0]}' (use status or scan)`,
				action: LocalAdminAction.NONE,
			};
		}

		return {ok: false, text: "Error: unknown local admin command", action: LocalAdminAction.NONE};
	}
}
