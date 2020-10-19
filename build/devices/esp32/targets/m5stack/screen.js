import ILI9341 from "ili9341";
import Digital from "pins/digital";

export default class {
	constructor(dictionary) {
		let isIps = Digital.read(33); // TFT_RST
		this.ili9341 = new ILI9341(dictionary);
		if (isIps) {
			this.ili9341.command(0x21); // invert
		}
	}
	begin(x, y, width, height) {
		return this.ili9341.begin(x, y, width, height);
	}
	send(pixels, offset, count) {
		return this.ili9341.send(pixels, offset, count);
	}
	end() {
		return this.ili9341.end();
	}
	adaptInvalid() {
		return this.ili9341.adaptInvalid();
	}
	continue() { }
	pixelsToBytes(count) {
		return this.ili9341.pixelsToBytes(count);
	}
	get pixelFormat() {
		return this.ili9341.pixelFormat;
	}
	get width() {
		return this.ili9341.width;
	}
	get height() {
		return this.ili9341.height;
	}
	get async() { return true; }
	get clut() {
		return this.ili9341.clut;
	}
	set clut(clut) {
		this.ili9341.clut = clut;
	}
	get rotation() {
		this.ili9341.rotation;
	}
	set rotation(r) {
		this.ili9341.rotation = r;
	}
	get c_dispatch() {
		return this.ili9341.c_dispatch;
	}
	// driver specific
	command(id, data) {
		return this.ili9341.command(id, data);
	}
}
