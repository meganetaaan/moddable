import {NVS_KEYS} from "./config.js";

function defaultState() {
	return {
		driver: "stopped",
		link: "disconnected",
		ssid: "",
		ip: "",
		rssi: "n/a",
		lastReason: "none",
	};
}

function formatReason(reason) {
	if ((undefined === reason) || (null === reason) || ("" === reason))
		return "none";
	return String(reason);
}

function uniqueAPs(accessPoints) {
	const seen = new Set;
	const unique = [];
	for (const accessPoint of accessPoints) {
		const ssid = String(accessPoint?.ssid ?? "<hidden>");
		if (seen.has(ssid))
			continue;
		seen.add(ssid);
		unique.push({
			ssid,
			rssi: Number.isFinite(accessPoint?.rssi) ? accessPoint.rssi : 0,
		});
	}
	unique.sort((left, right) => right.rssi - left.rssi);
	return unique;
}

export class WiFiService {
	constructor(options = {}) {
		this.WiFi = options.WiFi ?? null;
		this.Net = options.Net ?? null;
		this.timer = options.timer ?? null;
		this.store = options.store ?? null;
		this.connectTimeoutMs = options.connectTimeoutMs ?? 30000;
		this.maxScanEntries = options.maxScanEntries ?? 8;
		this.monitor = null;
		this.state = defaultState();
	}

	loadCredentials() {
		return {
			ssid: String(this.store?.get?.(NVS_KEYS.WIFI_SSID) ?? ""),
			password: String(this.store?.get?.(NVS_KEYS.WIFI_PASS) ?? ""),
		};
	}

	isProvisioned() {
		return Boolean(this.loadCredentials().ssid);
	}

	#refreshNet() {
		if (!this.Net?.get)
			return;
		this.state.ssid = String(this.Net.get("SSID") ?? this.state.ssid ?? "");
		this.state.ip = String(this.Net.get("IP") ?? this.state.ip ?? "");
		const rssi = this.Net.get("RSSI");
		this.state.rssi = Number.isFinite(rssi) ? String(rssi) : "n/a";
	}

	async connect(credentials = this.loadCredentials()) {
		if (!this.WiFi || !credentials?.ssid)
			return false;

		this.close();
		this.state.driver = "started";
		this.state.link = "connecting";
		this.state.ssid = credentials.ssid;
		this.state.lastReason = "none";

		if (this.WiFi.Mode?.station)
			this.WiFi.mode = this.WiFi.Mode.station;

		return await new Promise(resolve => {
			let settled = false;
			let timeoutId = 0;
			const finish = ok => {
				if (settled)
					return;
				settled = true;
				if (timeoutId)
					this.timer?.clear?.(timeoutId);
				resolve(ok);
			};

			this.monitor = new this.WiFi({
				ssid: credentials.ssid,
				password: credentials.password ?? "",
			}, (message, reason) => {
				if (message === this.WiFi.connected) {
					this.state.link = "connected";
					this.state.lastReason = "none";
					this.#refreshNet();
					return;
				}
				if (message === this.WiFi.gotIP) {
					this.state.link = "got_ip";
					this.state.lastReason = "none";
					this.#refreshNet();
					finish(true);
					return;
				}
				if (message === this.WiFi.lostIP) {
					this.state.link = "lost_ip";
					this.state.lastReason = formatReason(reason);
					this.#refreshNet();
					return;
				}
				if (message === this.WiFi.disconnected) {
					this.state.link = "disconnected";
					this.state.lastReason = formatReason(reason);
					this.#refreshNet();
					finish(false);
				}
			});

			timeoutId = this.timer?.set?.(() => {
				this.state.link = "timeout";
				this.state.lastReason = "timeout";
				finish(false);
			}, this.connectTimeoutMs) ?? 0;
		});
	}

	connectFromStore() {
		return this.connect(this.loadCredentials());
	}

	async scanText() {
		if (!this.WiFi?.scan)
			return "WiFi scan: unavailable";

		return await new Promise(resolve => {
			const accessPoints = [];
			try {
				this.WiFi.scan({}, accessPoint => {
					if (accessPoint) {
						accessPoints.push(accessPoint);
						return;
					}

					const unique = uniqueAPs(accessPoints);
					if (!unique.length) {
						resolve("WiFi scan: 0 APs visible");
						return;
					}

					const listed = unique
						.slice(0, this.maxScanEntries)
						.map(accessPoint => `${accessPoint.ssid}(${accessPoint.rssi})`)
						.join(", ");
					resolve(`WiFi scan: ${unique.length} APs visible - ${listed}`);
				});
			}
			catch {
				resolve("WiFi scan: unavailable");
			}
		});
	}

	statusText(options = {}) {
		this.#refreshNet();
		const provisioned = (undefined === options.provisioned) ? this.isProvisioned() : Boolean(options.provisioned);
		const safeMode = Boolean(options.safeMode);
		return (
			`WiFi status: provisioned=${provisioned ? "yes" : "no"} ` +
			`safe_mode=${safeMode ? "yes" : "no"} ` +
			`driver=${this.state.driver} link=${this.state.link} ` +
			`ssid=${this.state.ssid || "n/a"} ip=${this.state.ip || "n/a"} ` +
			`rssi=${this.state.rssi} last_reason=${this.state.lastReason}`
		);
	}

	close() {
		this.monitor?.close?.();
		this.monitor = null;
		this.state.driver = "stopped";
		this.state.link = "disconnected";
	}
}
