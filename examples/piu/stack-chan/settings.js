import {} from "piu/MC";
import { VerticalScrollerBehavior } from "scroller";

const defaultBackgroundSkin = new Skin({ fill: "#0d1017" });
const scrollerBackgroundSkin = new Skin({ fill: "#ff0000" });
const settingsTitleStyle = new Style({ font: "20px Open Sans", color: "#e7f7ff", horizontal: "center" });
const settingsTextStyle = new Style({ font: "NotoSansJP-Regular-16", color: "#e7f7ff", horizontal: "center" });
const settingsButtonSkin = new Skin({ fill: "#e7f7ff", stroke: "#131b26", borders: { left: 2, right: 2, top: 2, bottom: 2 } });
const settingsButtonPressedSkin = new Skin({ fill: "#c0c0c0", stroke: "#131b26", borders: { left: 2, right: 2, top: 2, bottom: 2 } });
const settingsButtonStyle = new Style({ font: "16px Open Sans", color: "#131b26", horizontal: "center", vertical: "middle" });
const settingsItemSkin = new Skin({ fill: "#131b26", stroke: "#e7f7ff", borders: { left: 1, right: 1, top: 1, bottom: 1 } });
const settingsItemStyle = new Style({ font: "16px Open Sans", color: "#e7f7ff", horizontal: "left", vertical: "middle" });

const defaultSettingsItems = [
	{ label: "Wi-Fi", action: "wifi" },
	{ label: "Bluetooth" },
	{ label: "Brightness" },
	{ label: "Volume" },
	{ label: "Language" },
	{ label: "Time Zone" },
	{ label: "Notifications" },
	{ label: "Privacy" },
	{ label: "Sleep Timer" },
	{ label: "Display Timeout" },
	{ label: "Developer Options" },
	{ label: "About Stack-chan" },
];

const BackButton = Container.template($ => ({
	left: 0, width: 44, height: 36,
	active: true,
	skin: settingsButtonSkin,
	contents: [
		new Label(null, { string: "<", style: settingsButtonStyle })
	],
	Behavior: class extends Behavior {
		onTouchBegan(container) {
			container.skin = settingsButtonPressedSkin;
		}
		onTouchCancelled(container) {
			container.skin = settingsButtonSkin;
		}
		onTouchEnded(container) {
			container.skin = settingsButtonSkin;
			application.delegate("backToMain");
		}
	}
}));

const SettingItem = Container.template($ => ({
	left: 0, right: 0, height: 52,
	active: true,
	skin: settingsItemSkin,
	contents: [
		new Label(null, { left: 12, right: 12, string: $.label ?? "Setting", style: settingsItemStyle })
	],
	Behavior: class extends Behavior {
		onCreate(container, data) {
			this.action = data.action ?? data.label;
			this.onSelect = data.onSelect;
		}
		onTouchBegan(container) {
			container.state = 1;
		}
		onTouchCancelled(container) {
			container.state = 0;
		}
		onTouchEnded(container) {
			container.state = 0;
			this.onSelect?.(this.action);
		}
	}
}));

export const SettingsScreen = Container.template($ => ({
	name: "settings",
	left: 0, right: 0, top: 0, bottom: 0,
	skin: $.backgroundSkin ?? defaultBackgroundSkin,
	contents: [
		// Header row with back button and centered title
		new Container(null, {
			left: 12, right: 12, top: 12, height: 44,
			contents: [
				new BackButton(),
				new Label(null, {
					left: 0, right: 0, top: 0, bottom: 0,
					string: "Settings",
					style: settingsTitleStyle,
				}),
			],
		}),
		new Label(null, { left: 0, right: 0, top: 64, string: "設定項目をここに追加できます", style: settingsTextStyle }),
	new Scroller(null, {
		left: 24, right: 24, top: 96, bottom: 16,
		active: true, clip: true,
		skin: scrollerBackgroundSkin,
		Behavior: VerticalScrollerBehavior,
		contents: [
			new Column(null, {
					left: 0, right: 0, top: 0, spacing: 8,
					contents: ($.items ?? defaultSettingsItems).map(item => new SettingItem({ ...item, onSelect: $.onSelect })),
				}),
			],
		}),
	],
}));
