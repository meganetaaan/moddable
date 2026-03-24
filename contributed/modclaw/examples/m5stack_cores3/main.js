import {} from "piu/MC";
import Timer from "timer";

import {createLiveZclawApp} from "../../modules/liveApp.js";

const palette = {
	background: new Skin({fill: "#f4efe5"}),
	panel: new Skin({fill: "#fffaf2", borders: {left: 2, right: 2, top: 2, bottom: 2}, stroke: "#1d3124"}),
	header: new Skin({fill: "#1d3124"}),
	accent: new Skin({fill: "#d86039"}),
	button: new Skin({fill: "#1d3124"}),
	log: new Skin({fill: "#203a57"}),
};

const styles = {
	title: new Style({font: "bold 30px Open Sans", color: "#fff7e8", horizontal: "left", vertical: "middle"}),
	subtitle: new Style({font: "16px Open Sans", color: "#f8d7c8", horizontal: "left", vertical: "middle"}),
	body: new Style({font: "17px Open Sans", color: "#142218", horizontal: "left", vertical: "top"}),
	log: new Style({font: "16px Open Sans", color: "#f5f4ee", horizontal: "left", vertical: "top"}),
	button: new Style({font: "bold 18px Open Sans", color: "#fff7e8", horizontal: "center", vertical: "middle"}),
};

class ButtonBehavior extends Behavior {
	onCreate(label, data) {
		this.action = data.action;
	}
	onTouchEnded(label) {
		label.bubble(this.action);
	}
}

const ActionButton = Label.template($ => ({
	left: 0,
	right: 0,
	height: 42,
	active: true,
	skin: palette.button,
	style: styles.button,
	string: $.title,
	Behavior: ButtonBehavior,
	action: $.action,
}));

class DashboardBehavior extends Behavior {
	onCreate(application, data) {
		this.data = data;
		this.log = "Ready.";
		this.app = createLiveZclawApp({
			sendStartupMessage: false,
			channelWriter: text => {
				this.log = String(text);
				application.delegate("refreshStatus");
			},
		});
	}

	onDisplaying(application) {
		this.refreshStatus(application);
		Promise.resolve(this.app.start())
			.then(result => {
				this.log = `start safe=${result.safeMode ? "yes" : "no"} configured=${result.deviceConfigured ? "yes" : "no"} wifi=${result.wifiConnected ? "yes" : "no"}`;
				this.refreshStatus(application);
			})
			.catch(error => {
				this.log = `start failed: ${error}`;
				this.refreshStatus(application);
			});
		this.timer = Timer.repeat(() => this.refreshStatus(application), 1000);
	}

	onUndisplaying() {
		Timer.clear(this.timer);
		this.timer = undefined;
		this.app.stop();
	}

	refreshStatus(application) {
		const status = [
			`safe mode: ${this.app.safeMode ? "yes" : "no"}`,
			`configured: ${this.app.deviceConfigured ? "yes" : "no"}`,
			this.app.wifi.statusText({safeMode: this.app.safeMode, provisioned: this.app.deviceConfigured}),
		].join("\n");
		this.data.STATUS.string = status;
		this.data.LOG.string = this.log;
	}

	onStartApp(application) {
		Promise.resolve(this.app.start())
			.then(result => {
				this.log = `start safe=${result.safeMode ? "yes" : "no"} configured=${result.deviceConfigured ? "yes" : "no"} wifi=${result.wifiConnected ? "yes" : "no"}`;
				this.refreshStatus(application);
			})
			.catch(error => {
				this.log = `start failed: ${error}`;
				this.refreshStatus(application);
			});
	}

	onStopApp(application) {
		this.app.stop();
		this.log = "runtime stopped";
		this.refreshStatus(application);
	}

	onShowWiFiStatus(application) {
		Promise.resolve(this.app.processChannelMessage("/wifi status"))
			.then(() => this.refreshStatus(application))
			.catch(error => {
				this.log = `status failed: ${error}`;
				this.refreshStatus(application);
			});
	}

	onScanWiFi(application) {
		Promise.resolve(this.app.wifi.scanText())
			.then(text => {
				this.log = text;
				this.refreshStatus(application);
			})
			.catch(error => {
				this.log = `scan failed: ${error}`;
				this.refreshStatus(application);
			});
	}
}

const DashboardApplication = Application.template($ => ({
	left: 0,
	right: 0,
	top: 0,
	bottom: 0,
	skin: palette.background,
	Behavior: DashboardBehavior,
	contents: [
		Container($, {
			left: 0,
			right: 0,
			top: 0,
			height: 58,
			skin: palette.header,
			contents: [
				Label($, {
					left: 16, top: 8, right: 16, height: 26,
					style: styles.title,
					string: "zclaw / CoreS3",
				}),
				Label($, {
					left: 16, top: 34, right: 16, height: 18,
					style: styles.subtitle,
					string: "Moddable live runtime dashboard",
				}),
			],
		}),
		Column($, {
			left: 12,
			right: 12,
			top: 70,
			bottom: 12,
			contents: [
				Container($, {
					left: 0, right: 0, height: 84,
					skin: palette.panel,
					contents: [
						Label($, {
							anchor: "STATUS",
							left: 12, right: 12, top: 10, bottom: 10,
							style: styles.body,
							string: "",
						}),
					],
				}),
				Row($, {
					left: 0, right: 0, top: 10, height: 42,
					contents: [
						ActionButton({left: 0, width: 72, title: "Start", action: "onStartApp"}),
						Content($, {width: 8}),
						ActionButton({left: 0, width: 72, title: "Stop", action: "onStopApp"}),
						Content($, {width: 8}),
						ActionButton({left: 0, width: 72, title: "Status", action: "onShowWiFiStatus"}),
						Content($, {width: 8}),
						ActionButton({left: 0, width: 72, title: "Scan", action: "onScanWiFi"}),
					],
				}),
				Container($, {
					left: 0, right: 0, top: 12, bottom: 0,
					skin: palette.log,
					contents: [
						Label($, {
							anchor: "LOG",
							left: 12, right: 12, top: 12, bottom: 12,
							style: styles.log,
							string: "",
						}),
					],
				}),
			],
		}),
	],
}));

export default new DashboardApplication({}, {displayListLength: 8192, touchCount: 1});
