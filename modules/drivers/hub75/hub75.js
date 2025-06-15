/*
 * Copyright (c) 2016-2024  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 * 
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 * 
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 * 
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

/*
 * HUB75 RGB LED Matrix Driver
 * 
 * ECMA-419 compliant driver for HUB75 RGB LED matrix panels
 * Implements Screen interface for Poco rendering integration
 * 
 * Usage:
 *   import HUB75 from "hub75";
 *   
 *   const display = new HUB75({
 *     width: 64,
 *     height: 32,
 *     chains: 1,
 *     brightness: 128,
 *     pins: {
 *       r1: 2, g1: 3, b1: 4,
 *       r2: 5, g2: 6, b2: 7,
 *       a: 8, b: 9, c: 10, d: 11,
 *       clk: 12, latch: 13, oe: 14
 *     }
 *   });
 */

import Digital from "embedded:io/digital";

// HUB75 configuration constants
const Config = Object.freeze({
	DefaultWidth: 64,
	DefaultHeight: 32,
	DefaultChains: 1,
	DefaultBrightness: 128,
	DefaultRefreshHz: 120,
	MaxBrightness: 255,
	MinBrightness: 0
});

// HUB75 display class - follows ECMA-419 patterns with Screen interface
export default class HUB75 @ "xs_HUB75_destructor" {
	#io;
	#config;
	#pins;
	
	constructor(options) @ "xs_HUB75";
	
	// ECMA-419 configure method
	configure(options) {
		if (options.brightness !== undefined) {
			this.brightness = options.brightness;
		}
		
		if (options.refreshHz !== undefined) {
			// Update refresh rate if supported by implementation
			this.#config.refreshHz = options.refreshHz;
		}
	}
	
	// Screen interface methods for Poco rendering
	begin(x, y, width, height) @ "xs_HUB75_begin";
	send(pixels, offset, count) @ "xs_HUB75_send";
	end() @ "xs_HUB75_end";
	
	// Screen interface continue method for async displays
	continue() {
		// HUB75 displays are async due to refresh timing
		// This method is called when display is ready for more data
	}
	
	// Pixel conversion utilities
	pixelsToBytes(count) {
		const bytesPerPixel = (this.pixelFormat === 0x44) ? 2 : 3; // RGB565 vs RGB888
		return count * bytesPerPixel;
	}
	
	adaptInvalid() @ "xs_HUB75_adaptInvalid";
	
	// Display properties (Screen interface)
	get width() @ "xs_HUB75_get_width";
	get height() @ "xs_HUB75_get_height";
	get pixelFormat() @ "xs_HUB75_get_pixelFormat";
	get async() { return true; }  // HUB75 is always async due to refresh timing
	get frameBuffer() { return false; }  // No direct frame buffer access
	
	// HUB75 specific properties
	get brightness() @ "xs_HUB75_get_brightness";
	set brightness(value) @ "xs_HUB75_set_brightness";
	
	get chains() {
		return this.#config?.chains ?? Config.DefaultChains;
	}
	
	get refreshHz() {
		return this.#config?.refreshHz ?? Config.DefaultRefreshHz;
	}
	
	// C dispatch for efficient pixel operations
	get c_dispatch() @ "xs_HUB75_get_c_dispatch";
	
	// ECMA-419 close method
	close() @ "xs_HUB75_close";
	
	// Display control methods
	clear(color = 0) {
		// Fill display with specified color
		const pixelCount = this.width * this.height;
		const bytesPerPixel = this.pixelsToBytes(1);
		const buffer = new ArrayBuffer(pixelCount * bytesPerPixel);
		const view = new Uint16Array(buffer);
		
		// Fill with color (assuming RGB565)
		for (let i = 0; i < pixelCount; i++) {
			view[i] = color;
		}
		
		this.begin(0, 0, this.width, this.height);
		this.send(buffer);
		this.end();
	}
	
	// Test pattern methods
	testPattern(pattern = "gradient") {
		const width = this.width;
		const height = this.height;
		const buffer = new ArrayBuffer(width * height * 2); // RGB565
		const view = new Uint16Array(buffer);
		
		switch (pattern) {
			case "gradient":
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						const r = Math.floor((x / width) * 31);
						const g = Math.floor((y / height) * 63);
						const b = Math.floor(((x + y) / (width + height)) * 31);
						view[y * width + x] = (r << 11) | (g << 5) | b;
					}
				}
				break;
				
			case "checkerboard":
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						const checker = ((x >> 3) + (y >> 3)) & 1;
						view[y * width + x] = checker ? 0xFFFF : 0x0000;
					}
				}
				break;
				
			case "colors":
				const colors = [0xF800, 0x07E0, 0x001F, 0xFFE0, 0xF81F, 0x07FF, 0xFFFF];
				const blockWidth = Math.floor(width / colors.length);
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						const colorIndex = Math.floor(x / blockWidth);
						view[y * width + x] = colors[colorIndex % colors.length];
					}
				}
				break;
		}
		
		this.begin(0, 0, width, height);
		this.send(buffer);
		this.end();
	}
	
	// Color utility methods
	static rgb565(r, g, b) {
		return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
	}
	
	static hsvToRgb565(h, s, v) {
		// Convert HSV to RGB565
		h = h % 360;
		s = Math.max(0, Math.min(1, s));
		v = Math.max(0, Math.min(1, v));
		
		const c = v * s;
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
		const m = v - c;
		
		let r, g, b;
		if (h < 60) { r = c; g = x; b = 0; }
		else if (h < 120) { r = x; g = c; b = 0; }
		else if (h < 180) { r = 0; g = c; b = x; }
		else if (h < 240) { r = 0; g = x; b = c; }
		else if (h < 300) { r = x; g = 0; b = c; }
		else { r = c; g = 0; b = x; }
		
		r = Math.floor((r + m) * 255);
		g = Math.floor((g + m) * 255);
		b = Math.floor((b + m) * 255);
		
		return HUB75.rgb565(r, g, b);
	}
	
	// Validation helper
	static validatePins(pins) {
		const required = ['r1', 'g1', 'b1', 'r2', 'g2', 'b2', 'a', 'b', 'c', 'd', 'clk', 'latch', 'oe'];
		const missing = required.filter(pin => pins[pin] === undefined);
		
		if (missing.length > 0) {
			throw new Error(`Missing required pins: ${missing.join(', ')}`);
		}
		
		// Validate pin numbers
		for (const [name, pin] of Object.entries(pins)) {
			if (typeof pin !== 'number' || pin < 0) {
				throw new Error(`Invalid pin number for ${name}: ${pin}`);
			}
		}
		
		return true;
	}
}

// Export configuration constants
export { Config };

// Export static methods for convenience
export const rgb565 = HUB75.rgb565;
export const hsvToRgb565 = HUB75.hsvToRgb565;

Object.freeze(HUB75.prototype);