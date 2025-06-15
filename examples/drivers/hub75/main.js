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
 * HUB75 RGB LED Matrix Example
 * 
 * Demonstrates:
 * - Basic HUB75 display initialization
 * - ECMA-419 API usage
 * - Screen interface with Poco rendering
 * - Various display patterns and effects
 */

import HUB75, { rgb565, hsvToRgb565 } from "hub75";
import Poco from "commodetto/Poco";
import Resource from "Resource";
import Timer from "timer";

// Display configuration
const displayConfig = {
	width: 64,
	height: 32,
	chains: 1,
	brightness: 128,
	refreshHz: 120
};

// Initialize HUB75 display
const display = new HUB75(displayConfig);

// Create Poco renderer
const poco = new Poco(display);

// Color constants
const Colors = {
	RED: rgb565(255, 0, 0),
	GREEN: rgb565(0, 255, 0),
	BLUE: rgb565(0, 0, 255),
	YELLOW: rgb565(255, 255, 0),
	MAGENTA: rgb565(255, 0, 255),
	CYAN: rgb565(0, 255, 255),
	WHITE: rgb565(255, 255, 255),
	BLACK: rgb565(0, 0, 0)
};

trace("HUB75 Display initialized\n");
trace(`Display size: ${display.width}x${display.height}\n`);
trace(`Pixel format: ${display.pixelFormat}\n`);
trace(`Brightness: ${display.brightness}\n`);

// Demo state
let demoState = {
	mode: 0,
	frame: 0,
	hue: 0
};

// Demo functions
function runTestPatterns() {
	trace("Running test patterns...\n");
	
	// Test pattern 1: Solid colors
	display.clear(Colors.RED);
	Timer.delay(1000);
	
	display.clear(Colors.GREEN);
	Timer.delay(1000);
	
	display.clear(Colors.BLUE);
	Timer.delay(1000);
	
	// Test pattern 2: Built-in patterns
	display.testPattern("gradient");
	Timer.delay(2000);
	
	display.testPattern("checkerboard");
	Timer.delay(2000);
	
	display.testPattern("colors");
	Timer.delay(2000);
}

function drawPixelArt() {
	trace("Drawing pixel art with Poco...\n");
	
	// Clear display
	poco.begin();
	poco.fillRectangle(Colors.BLACK, 0, 0, display.width, display.height);
	
	// Draw a simple smiley face
	const centerX = display.width / 2;
	const centerY = display.height / 2;
	
	// Face outline (yellow circle)
	drawCircle(poco, centerX, centerY, 12, Colors.YELLOW);
	
	// Eyes (black dots)
	poco.fillRectangle(Colors.BLACK, centerX - 4, centerY - 4, 2, 2);
	poco.fillRectangle(Colors.BLACK, centerX + 2, centerY - 4, 2, 2);
	
	// Mouth (red arc simulation with pixels)
	for (let x = -6; x <= 6; x++) {
		const y = Math.floor(Math.sqrt(36 - x * x) / 2);
		poco.fillRectangle(Colors.RED, centerX + x, centerY + y, 1, 1);
	}
	
	poco.end();
}

function drawCircle(poco, centerX, centerY, radius, color) {
	// Simple circle drawing using midpoint algorithm
	for (let x = -radius; x <= radius; x++) {
		for (let y = -radius; y <= radius; y++) {
			if (x * x + y * y <= radius * radius) {
				poco.fillRectangle(color, centerX + x, centerY + y, 1, 1);
			}
		}
	}
}

function animateRainbow() {
	poco.begin();
	
	// Create rainbow effect
	for (let x = 0; x < display.width; x++) {
		const hue = (demoState.hue + x * 360 / display.width) % 360;
		const color = hsvToRgb565(hue, 1.0, 1.0);
		
		poco.fillRectangle(color, x, 0, 1, display.height);
	}
	
	poco.end();
	
	demoState.hue = (demoState.hue + 2) % 360;
}

function animateWave() {
	poco.begin();
	poco.fillRectangle(Colors.BLACK, 0, 0, display.width, display.height);
	
	// Draw sine wave
	for (let x = 0; x < display.width; x++) {
		const angle = (x + demoState.frame) * Math.PI / 16;
		const y = Math.floor(display.height / 2 + Math.sin(angle) * (display.height / 4));
		
		if (y >= 0 && y < display.height) {
			const hue = (x * 360 / display.width) % 360;
			const color = hsvToRgb565(hue, 1.0, 1.0);
			poco.fillRectangle(color, x, y, 1, 2);
		}
	}
	
	poco.end();
	
	demoState.frame++;
}

function animateSparkle() {
	// Don't clear the display, just add sparkles
	poco.begin();
	
	// Add random sparkles
	for (let i = 0; i < 5; i++) {
		const x = Math.floor(Math.random() * display.width);
		const y = Math.floor(Math.random() * display.height);
		const brightness = Math.random();
		const color = hsvToRgb565(0, 0, brightness); // White sparkles
		
		poco.fillRectangle(color, x, y, 1, 1);
	}
	
	// Fade existing pixels
	if (demoState.frame % 4 === 0) {
		// Simple fade effect by drawing semi-transparent black
		// This is a simplified version - real fade would require reading back pixels
		poco.fillRectangle(rgb565(8, 8, 8), 0, 0, display.width, display.height);
		poco.blendRectangle(rgb565(0, 0, 0), 0, 0, display.width, display.height, 240);
	}
	
	poco.end();
	
	demoState.frame++;
}

function runBrightnessTest() {
	trace("Testing brightness control...\n");
	
	display.clear(Colors.WHITE);
	
	// Fade from bright to dim and back
	for (let brightness = 255; brightness >= 0; brightness -= 5) {
		display.brightness = brightness;
		Timer.delay(50);
	}
	
	for (let brightness = 0; brightness <= 255; brightness += 5) {
		display.brightness = brightness;
		Timer.delay(50);
	}
	
	display.brightness = 128; // Reset to default
}

// Main demo loop
function runDemo() {
	trace("Starting HUB75 demo...\n");
	
	// Run initial test patterns
	runTestPatterns();
	
	// Draw static pixel art
	drawPixelArt();
	Timer.delay(3000);
	
	// Test brightness control
	runBrightnessTest();
	
	// Start animated demos
	let animationTimer = Timer.repeat(() => {
		switch (demoState.mode) {
			case 0:
				animateRainbow();
				break;
			case 1:
				animateWave();
				break;
			case 2:
				animateSparkle();
				break;
		}
		
		// Switch modes every 5 seconds (assuming 60fps)
		if (demoState.frame % 300 === 0) {
			demoState.mode = (demoState.mode + 1) % 3;
			demoState.frame = 0;
			if (demoState.mode === 2) {
				// Clear for sparkle mode
				display.clear(Colors.BLACK);
			}
		}
	}, 16); // ~60fps
	
	// Switch to brightness test every 30 seconds
	Timer.repeat(() => {
		Timer.clear(animationTimer);
		runBrightnessTest();
		
		// Restart animation
		demoState.mode = 0;
		demoState.frame = 0;
		demoState.hue = 0;
		
		animationTimer = Timer.repeat(() => {
			switch (demoState.mode) {
				case 0:
					animateRainbow();
					break;
				case 1:
					animateWave();
					break;
				case 2:
					animateSparkle();
					break;
			}
			
			if (demoState.frame % 300 === 0) {
				demoState.mode = (demoState.mode + 1) % 3;
				demoState.frame = 0;
				if (demoState.mode === 2) {
					display.clear(Colors.BLACK);
				}
			}
		}, 16);
	}, 30000);
}

// Error handling
try {
	runDemo();
} catch (error) {
	trace(`Demo error: ${error}\n`);
	
	// Fallback: simple color cycling
	let colorIndex = 0;
	const testColors = [Colors.RED, Colors.GREEN, Colors.BLUE, Colors.YELLOW, Colors.MAGENTA, Colors.CYAN];
	
	Timer.repeat(() => {
		display.clear(testColors[colorIndex]);
		colorIndex = (colorIndex + 1) % testColors.length;
	}, 1000);
}

// Cleanup on exit
globalThis.onExit = function() {
	trace("Cleaning up HUB75 display...\n");
	display.clear(Colors.BLACK);
	display.close();
};