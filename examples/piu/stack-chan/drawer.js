import {} from "piu/MC";
import Timeline from "piu/Timeline";

const drawerSkin = new Skin({ fill: "#111822" });
const drawerButtonSkin = new Skin({ fill: "#1e2a38" });
const drawerButtonStyle = new Style({ font: "18px Open Sans", color: "#e7f7ff", horizontal: "left" });
const drawerWidth = 140;

const DrawerButton = Container.template($ => ({
	left: 0,
	right: 0,
	height: 44,
	active: true,
	skin: drawerButtonSkin,
	contents: [
		new Label({ left: 12, right: 12, top: 0, bottom: 0, string: $.label ?? "Button", style: drawerButtonStyle }),
	],
	Behavior: class extends Behavior {
		onCreate(content, data) {
			this.action = data.action;
		}
		onTouchEnded(content) {
			if (this.action)
				application.delegate(this.action);
		}
	}
}));

export const Drawer = Container.template($ => ({
	name: "drawer",
	left: null,
	right: -drawerWidth,
	top: 0,
	bottom: 0,
	width: drawerWidth,
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
		}
		onTimeChanged(container) {
			if (this.timeline)
				this.timeline.seekTo(container.time);
		}
		onFinished(container) {
			this.timeline = null;
		}
		toggle(container) {
			const from = this.isOpen ? 0 : -drawerWidth;
			const to = this.isOpen ? -drawerWidth : 0;
			const tl = (this.timeline = new Timeline());
			tl.on(container, { right: [from, to] }, 180, Math.quadEaseOut, 0);
			tl.seekTo(0);
			container.duration = tl.duration;
			container.time = 0;
			container.start();
			this.isOpen = !this.isOpen;
		}
	}
}));

export const drawerConstants = { drawerWidth };
