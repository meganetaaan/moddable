/*
 * Copyright (c) 2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Tools.
 *
 *   This file is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This file is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this file. If not, see <http://www.gnu.org/licenses/>.
 */

import * as piuAllNamespace from "piu/All";
import * as piuButtonsNamespace from "piu/Buttons";
import * as piuPCNamespace from "piu/PC";
import * as piuScreenNamespace from "piu/Screen";
import * as piuScrollbarsNamespace from "piu/Scrollbars";
import * as piuSlidersNamespace from "piu/Sliders";
import * as piuSwitchesNamespace from "piu/Switches";
import * as BinaryMessageNamespace from "BinaryMessage";
import * as ControlsPaneNamespace from "ControlsPane";
import * as DevicePaneNamespace from "DevicePane";
import * as assetsNamespace from "assets";

import {} from "piu/PC";

import { buildAssets } from "assets";
import { isButtonsRow } from "ControlsPane";
import { Screen } from "piu/Screen";
import {
	ScrollerBehavior,
	HorizontalScrollbar,
	VerticalScrollbar,
} from "piu/Scrollbars";
import * as Window from "Window";

const WINDOW_HORIZONTAL_MARGIN = 80;
const WINDOW_VERTICAL_MARGIN = 120;
const EMPTY_WIDTH = 320;
const EMPTY_HEIGHT = 120;

class ApplicationBehavior extends Behavior {
	onCreate(application) {
		globalThis.model = this;
		application.interval = 100;
		this.devices = [];
		this.device = null;
		this.libraryPath = "";
		this.localLibraryPath = system.buildPath(system.localDirectory, "mc", "so");
		this.devicesPath = this.findDevicesPath();
		this.compartmentOptions = {
			globals: { ...Object.getPrototypeOf(globalThis), ...globalThis, Date, Math },
			modules: {
				"piu/All": { namespace: piuAllNamespace },
				"piu/Buttons": { namespace: piuButtonsNamespace },
				"piu/PC": { namespace: piuPCNamespace },
				"piu/Screen": { namespace: piuScreenNamespace },
				"piu/Scrollbars": { namespace: piuScrollbarsNamespace },
				"piu/Sliders": { namespace: piuSlidersNamespace },
				"piu/Switches": { namespace: piuSwitchesNamespace },
				"BinaryMessage": { namespace: BinaryMessageNamespace },
				"ControlsPane": { namespace: ControlsPaneNamespace },
				"DevicePane": { namespace: DevicePaneNamespace },
				"assets": { namespace: assetsNamespace },
			},
			resolveHook(specifier, refererSpecifier) {
				if (specifier[0] == '.') {
					let dot = 1;
					let slash = refererSpecifier.lastIndexOf('/');
					if (specifier[1] == '.') {
						dot++;
						slash = refererSpecifier.lastIndexOf('/', slash - 1);
					}
					return refererSpecifier.slice(0, slash) + specifier.slice(dot);
				}
				return specifier;
			},
			loadNowHook(specifier) {
				return {
					source: new ModuleSource(system.readFileString(specifier)),
					importMeta: { uri:specifier },
				};
			},
		};
	}

	onAppearanceChanged(application, appearance) {
		buildAssets(appearance ?? 0);
		if (!application.first) {
			application.add(new EmptyView({ message:"Open a Linux mc.so to begin." }));
			this.resizeWindow(application, EMPTY_WIDTH, EMPTY_HEIGHT);
			this.reloadDevices();
			if (this.openFiles)
				application.defer("onOpenFileCallback");
		}
	}

	findDevicesPath() {
		let path = system.applicationPath;
		for (let index = 0; index < 4; index++)
			path = system.getPathDirectory(path);
		return system.buildPath(path, "simulators");
	}

	reloadDevices() {
		this.devices = [];
		if (!system.fileExists(this.devicesPath))
			return;
		const iterator = new system.DirectoryIterator(this.devicesPath);
		for (let info = iterator.next(); info; info = iterator.next()) {
			if (info.directory || !info.name.endsWith(".js"))
				continue;
			try {
				const compartment = new Compartment(this.compartmentOptions);
				const device = compartment.importNow(info.path).default;
				if (!device || !(device.DeviceTemplate || device.DeviceTemplates))
					continue;
				device.compartment = compartment;
				if (device.applicationName)
					device.applicationFilter = new RegExp(device.applicationName + "/mc\\.so$");
				this.devices.push(device);
			}
			catch (error) {
				trace(`mcsim-lite: cannot load ${info.path}: ${error}\n`);
			}
		}
		this.devices.sort((a, b) => a.title.localeCompare(b.title));
	}

	findDevice(path) {
		return this.devices.find(device => device.applicationFilter?.test(path));
	}

	createDeviceView(device) {
		const Template = device.DeviceTemplates?.[0] ?? device.DeviceTemplate;
		const deviceContainer = new Template(device);
		let screen = null;
		for (let content = deviceContainer.first; content; content = content.next) {
			if (content instanceof Screen) {
				screen = content;
				break;
			}
		}
		if (!screen)
			throw new Error(`Simulator '${device.title}' has no direct DeviceScreen`);

		for (let content = deviceContainer.first; content; ) {
			const next = content.next;
			if (content !== screen)
				deviceContainer.remove(content);
			content = next;
		}
		const screenCoordinates = screen.coordinates;
		const screenWidth = screenCoordinates.width ?? 0;
		const screenHeight = screenCoordinates.height ?? 0;
		screen.coordinates = { left:0, width:screenWidth, top:0, height:screenHeight };
		deviceContainer.coordinates = { left:0, width:screenWidth, top:0, height:screenHeight };

		const buttons = new device.ControlsTemplate(device);
		let buttonCount = 0;
		let buttonsWidth = 0;
		for (let content = buttons.first; content; ) {
			const next = content.next;
			if (isButtonsRow(content)) {
				buttonCount++;
				let rowWidth = 0;
				for (let child = content.first; child; child = child.next)
					rowWidth += child.coordinates.width ?? 0;
				buttonsWidth = Math.max(buttonsWidth, rowWidth);
			}
			else
				buttons.remove(content);
			content = next;
		}
		const buttonHeight = buttonCount * 30;
		const workarea = Window.getWorkarea(application);
		const maximumWidth = Math.max(1, workarea.width - WINDOW_HORIZONTAL_MARGIN);
		const maximumHeight = Math.max(buttonHeight + 1, workarea.height - WINDOW_VERTICAL_MARGIN);
		const contentWidth = Math.max(screenWidth, buttonsWidth);
		const viewportWidth = Math.min(contentWidth, maximumWidth);
		const viewportHeight = Math.min(screenHeight, maximumHeight - buttonHeight);

		buttons.coordinates = { left:0, width:viewportWidth, top:0, height:buttonHeight };
		const deviceHost = new Container(null, {
			left:0, width:screenWidth, top:0, height:screenHeight,
			contents:[deviceContainer],
		});
		this.DEVICE = deviceHost;
		this.CONTROLS = buttons;
		return {
			view: new CompactView({
				buttons,
				buttonHeight,
				deviceHost,
				screenHeight,
				screenWidth,
				viewportHeight,
				viewportWidth,
			}),
			width: viewportWidth,
			height: viewportHeight + buttonHeight,
		};
	}

	open(application, path) {
		if (!system.fileExists(path))
			return this.reportError(`File not found:\n${path}`);
		if (!path.endsWith(".so"))
			return this.reportError("mcsim-lite accepts Linux mc.so files only.");
		const device = this.findDevice(path);
		if (!device) {
			const names = this.devices.map(item => item.applicationName).filter(Boolean).join("\n");
			return this.reportError(`No simulator matches:\n${path}\n\nExpected path patterns:\n${names}`);
		}

		this.quitScreen();
		application.distribute("onDeviceUnselected");
		try {
			const compact = this.createDeviceView(device);
			application.replace(application.first, compact.view);
			this.device = device;
			this.libraryPath = path;
			application.title = `mcsim-lite — ${device.title}`;
			application.distribute("onDeviceSelected", device);
			this.launchScreen();
			this.resizeWindow(application, compact.width, compact.height);
		}
		catch (error) {
			this.device = null;
			this.libraryPath = "";
			this.reportError(String(error));
		}
	}

	launchScreen() {
		if (!this.libraryPath || !this.SCREEN)
			return;
		system.copyFile(this.libraryPath, this.localLibraryPath);
		this.SCREEN.launch(this.localLibraryPath);
		this.DEVICE.first.delegate("onLaunch");
		application.updateMenus();
	}

	quitScreen() {
		if (this.SCREEN)
			this.SCREEN.quit();
		if (system.fileExists(this.localLibraryPath))
			system.deleteFile(this.localLibraryPath);
	}

	resizeWindow(application, width, height) {
		application.defer("onResizeWindow", width, height);
	}

	onResizeWindow(application, width, height) {
		Window.resize(application, width, height);
	}

	reportError(message) {
		system.alert({
			type:"stop",
			prompt:"mcsim-lite",
			info:message,
			buttons:["OK"],
		}, () => {});
	}

	onAbort(application, status, reason) {
		this.quitScreen();
		if (status)
			this.reportError(`XS abort: ${reason}`);
	}

	onKeyDown(application, key) {
		this.DEVICE?.first.delegate("onKeyDown", key);
	}

	onKeyUp(application, key) {
		this.DEVICE?.first.delegate("onKeyUp", key);
	}

	onOpenFile(application, path) {
		if (this.openFiles)
			this.openFiles.push(new String(path));
		else {
			this.openFiles = [new String(path)];
			application.defer("onOpenFileCallback");
		}
	}

	onOpenFileCallback(application) {
		if (!application.first)
			return;
		const paths = this.openFiles ?? [];
		delete this.openFiles;
		if (paths.length)
			this.open(application, paths[paths.length - 1]);
	}

	onQuit(application) {
		this.quitScreen();
		application.quit();
	}

	canOpenFile() {
		return true;
	}

	doOpenFile() {
		system.openFile({ prompt:"Open mc.so", path:system.documentsDirectory }, path => {
			if (path)
				application.defer("onOpenFile", new String(path));
		});
	}

	canReloadFile() {
		return Boolean(this.libraryPath && this.SCREEN);
	}

	doReloadFile() {
		const path = this.libraryPath;
		this.quitScreen();
		this.libraryPath = path;
		this.launchScreen();
	}

	canQuit() {
		return true;
	}

	doQuit() {
		this.onQuit(application);
	}
}

const EmptyView = Container.template($ => ({
	left:0, right:0, top:0, bottom:0,
	skin:new Skin({ fill:"#cccccc" }),
	contents:[
		Label($, {
			left:12, right:12, top:12, bottom:12,
			style:new Style({ font:"14px Open Sans", color:"#404040" }),
			string:$.message,
		}),
	],
}));

const CompactView = Container.template($ => ({
	left:0, right:0, top:0, bottom:0,
	skin:skins.background,
	contents:[
		Scroller($, {
			left:0, width:$.viewportWidth, top:0, height:$.viewportHeight,
			active:true, clip:true,
			Behavior:ScrollerBehavior,
			contents:[
				$.deviceHost,
				HorizontalScrollbar($, {}),
				VerticalScrollbar($, {}),
			],
		}),
		Container($, {
			left:0, width:$.viewportWidth, top:$.viewportHeight, height:$.buttonHeight,
			skin:skins.paneBody,
			contents:[$.buttons],
		}),
	],
}));

const MCSimLiteApplication = Application.template($ => ({
	style:{ font:"12px Open Sans" },
	Behavior:ApplicationBehavior,
	menus:[
		{
			title:"File",
			items:[
				{ title:"Open...", key:"O", command:"OpenFile" },
				{ title:"Reload", key:"R", command:"ReloadFile" },
				null,
				{ title:"Quit", key:"Q", command:"Quit" },
			],
		},
	],
	window:{ title:"mcsim-lite" },
}));

export default new MCSimLiteApplication(null, { touchCount:1 });
