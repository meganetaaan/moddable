import {} from "piu/MC";
import Timeline from "piu/Timeline";

const scrollerSkin = new Skin({ fill: "#444" });
const drawerSkin = new Skin({ fill: "#FF0000" });
const drawerButtonSkin = new Skin({ fill: "#fafafa" });
const drawerButtonPressedSkin = new Skin({ fill: "#c0c0c0" });
const drawerButtonStyle = new Style({ font: "16px Open Sans", color: "#222", horizontal: "left" });
const drawerWidth = 140;
const toggleOnSkin = new Skin({ fill: "#23c552" });  // green
const toggleOffSkin = new Skin({ fill: "#888888" }); // gray

const DrawerButton = Container.template($ => ({
	left: 0,
	right: 0,
	height: 44,
	active: true,
	skin: drawerButtonSkin,
	contents: [
		// Optional toggle indicator on the left
		$.toggleKey ? new Content(null, { left: 12, width: 16, height: 16, top: 14, skin: toggleOffSkin }) : null,
		new Label(null, {
			left: $.toggleKey ? 36 : 12,
			right: 12,
			top: 0,
			bottom: 0,
			string: $.label ?? "Button",
			style: drawerButtonStyle
		}),
	],
	Behavior: class extends Behavior {
		onCreate(content, data) {
			this.action = data.action;
			this.toggleKey = data.toggleKey;
			this.icon = this.toggleKey ? content.first : null;
		}
		onTouchBegan(content) {
			content.skin = drawerButtonPressedSkin;
		}
		onTouchCancelled(content) {
			content.skin = drawerButtonSkin;
		}
		onTouchEnded(content) {
			content.skin = drawerButtonSkin;
			if (this.action)
				application.delegate(this.action);
		}
		onFaceContext(_content, face) {
			if (!this.icon || !this.toggleKey)
				return;
			// Currently only "mouth" is supported.
			const active = this.toggleKey === "mouth" ? !!face.mouth?.open : false;
			this.icon.skin = active ? toggleOnSkin : toggleOffSkin;
		}
	}
}));

export const Drawer = Container.template($ => ({
	name: "drawer",
	// left: 0,
	// right: -drawerWidth,
	// right: 0,
	top: 0,
	bottom: 0,
	width: drawerWidth,
	// width: 20,
	clip: true,
	skin: drawerSkin,
	contents: [
		Scroller(null, {
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
			clip: true,
			active: true,
			skin: scrollerSkin,
			contents: [
				Column(null, {
					left: 0,
					right: 0,
					top: 0,
					contents: $.buttons?.map(b => new DrawerButton(b)) ?? [],
				}),
			],
		}),
	],
	Behavior: class extends Behavior {
		onCreate(container) {
			this.isOpen = false;
			this.timeline = null;
			this.offset = -drawerWidth; // current right value
			this.applyPosition(container, this.offset);
		}
		onTimeChanged(container) {
			if (this.timeline) {
				this.timeline.seekTo(container.time);
				this.applyPosition(container, this.offset);
			}
		}
		onFinished(container) {
			this.timeline = null;
		}
		applyPosition(container, right) {
			container.coordinates = {
				right,
				width: drawerWidth,
				top: 0,
				bottom: 0,
			};
		}
		toggle(container) {
			const from = this.isOpen ? 0 : -drawerWidth;
			const to = this.isOpen ? -drawerWidth : 0;

			const tl = (this.timeline = new Timeline());
			tl.on(this, { offset: [from, to] }, 180, Math.quadEaseOut, 0);
			tl.seekTo(0);
			container.duration = tl.duration;
			container.time = 0;
			container.start();

			this.isOpen = !this.isOpen;
		}
	}
}));

export const drawerConstants = { drawerWidth };
