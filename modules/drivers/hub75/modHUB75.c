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

#include "xsmc.h"
#include "xsHost.h"
#include "mc.xs.h"
#include "mc.defines.h"

#include "commodettoBitmap.h"
#include "commodettoPocoBlit.h"
#include "commodettoPixelsOut.h"
#include "modHUB75.h"
#include "modGPIO.h"
#include "modTimer.h"

#include <string.h>

// Pixel format constants
#define kPixelFormat (kCommodettoBitmapFormat | kCommodettoBitmapPacked)
#define kPixelFormatDefault kCommodettoBitmapRGB565LE

// HUB75 timing constants (microseconds)
#define HUB75_LATCH_PULSE_US	1
#define HUB75_CLK_PULSE_US		1
#define HUB75_ROW_BLANK_US		10

// Dispatch table
static const PixelsOutDispatchRecord gPixelsOutDispatch = {
	hub75Begin,
	hub75Send, 
	hub75End,
	hub75AdaptInvalid
};

// Gamma correction table (8-bit to 8-bit)
static const uint8_t gammaTable[256] = {
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2,
	2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5,
	6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 11, 11,
	11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18,
	19, 19, 20, 21, 21, 22, 22, 23, 23, 24, 25, 25, 26, 27, 27, 28,
	29, 29, 30, 31, 31, 32, 33, 34, 34, 35, 36, 37, 37, 38, 39, 40,
	40, 41, 42, 43, 44, 45, 46, 46, 47, 48, 49, 50, 51, 52, 53, 54,
	55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
	71, 72, 73, 74, 76, 77, 78, 79, 80, 81, 83, 84, 85, 86, 88, 89,
	90, 91, 93, 94, 95, 96, 98, 99, 100, 102, 103, 104, 106, 107, 109, 110,
	111, 113, 114, 116, 117, 119, 120, 121, 123, 124, 126, 128, 129, 131, 132, 134,
	135, 137, 138, 140, 142, 143, 145, 146, 148, 150, 151, 153, 155, 157, 158, 160,
	162, 163, 165, 167, 169, 170, 172, 174, 176, 178, 179, 181, 183, 185, 187, 189,
	191, 193, 194, 196, 198, 200, 202, 204, 206, 208, 210, 212, 214, 216, 218, 220,
	222, 224, 227, 229, 231, 233, 235, 237, 239, 241, 244, 246, 248, 250, 252, 255
};

// Helper macros for GPIO control
#define SET_PIN(pin, value) modGPIOWrite(&hd->pin, value)
#define SET_ROW_PINS(row) do { \
	SET_PIN(a, (row) & 1); \
	SET_PIN(b, ((row) >> 1) & 1); \
	SET_PIN(c, ((row) >> 2) & 1); \
	SET_PIN(d, ((row) >> 3) & 1); \
	if (hd->config.hasE) SET_PIN(e, ((row) >> 4) & 1); \
} while(0)

// Forward declarations
static void hub75InitGPIO(HUB75Display hd);
static void hub75UninitGPIO(HUB75Display hd);
static void hub75RefreshTimer(modTimer timer, void *refcon, int refconSize);
static void hub75PushPixels(HUB75Display hd, uint8_t row);
static uint8_t hub75GammaCorrect(uint8_t value);

void xs_HUB75_destructor(void *data)
{
	HUB75Display hd = (HUB75Display)data;
	if (!hd) return;
	
	hub75StopRefresh(hd);
	hub75UninitGPIO(hd);
	
	if (hd->frontBuffer) {
		c_free(hd->frontBuffer);
		hd->frontBuffer = NULL;
	}
	if (hd->backBuffer) {
		c_free(hd->backBuffer);
		hd->backBuffer = NULL;
	}
}

void xs_HUB75(xsMachine *the)
{
	HUB75Display hd;
	int width = MODDEF_HUB75_WIDTH;
	int height = MODDEF_HUB75_HEIGHT;
	int chains = MODDEF_HUB75_CHAINS;
	int brightness = MODDEF_HUB75_BRIGHTNESS;
	int refreshHz = MODDEF_HUB75_REFRESH_HZ;
	int pixelFormat = kPixelFormatDefault;
	
	if (xsmcHas(xsArg(0), xsID_width))
		width = xsmcToInteger(xsmcGet(xsArg(0), xsID_width));
	if (xsmcHas(xsArg(0), xsID_height))
		height = xsmcToInteger(xsmcGet(xsArg(0), xsID_height));
	if (xsmcHas(xsArg(0), xsID_chains))
		chains = xsmcToInteger(xsmcGet(xsArg(0), xsID_chains));
	if (xsmcHas(xsArg(0), xsID_brightness))
		brightness = xsmcToInteger(xsmcGet(xsArg(0), xsID_brightness));
	if (xsmcHas(xsArg(0), xsID_refreshHz))
		refreshHz = xsmcToInteger(xsmcGet(xsArg(0), xsID_refreshHz));
	if (xsmcHas(xsArg(0), xsID_pixelFormat))
		pixelFormat = xsmcToInteger(xsmcGet(xsArg(0), xsID_pixelFormat));
	
	hd = (HUB75Display)c_calloc(1, sizeof(HUB75Record));
	if (!hd)
		xsUnknownError("no memory");
	
	hd->dispatch = (PixelsOutDispatch)&gPixelsOutDispatch;
	
	// Configure display parameters
	hd->config.width = width * chains;
	hd->config.height = height;
	hd->config.chains = chains;
	hd->config.brightness = brightness;
	hd->config.refreshHz = refreshHz;
	hd->config.pixelFormat = pixelFormat;
	hd->config.hasE = (MODDEF_HUB75_E_PIN >= 0) && (height > 32);
	
	// Calculate buffer size
	uint8_t bytesPerPixel = (kCommodettoBitmapRGB565LE == pixelFormat) ? 2 : 3;
	hd->bufferSize = hd->config.width * hd->config.height * bytesPerPixel;
	
	// Allocate frame buffers
	hd->frontBuffer = (uint8_t*)c_malloc(hd->bufferSize);
	hd->backBuffer = (uint8_t*)c_malloc(hd->bufferSize);
	if (!hd->frontBuffer || !hd->backBuffer) {
		xs_HUB75_destructor(hd);
		xsUnknownError("no memory for frame buffers");
	}
	
	// Clear buffers
	memset(hd->frontBuffer, 0, hd->bufferSize);
	memset(hd->backBuffer, 0, hd->bufferSize);
	
	// Calculate timing
	uint8_t rowsPerScan = hd->config.height / 2;  // HUB75 scans half the rows at once
	hd->rowTime = (1000000 / hd->config.refreshHz) / rowsPerScan;
	hd->oeTime = (hd->rowTime * hd->config.brightness) / 255;
	
	// Initialize GPIO
	hub75InitGPIO(hd);
	
	// Start refresh timer
	hub75StartRefresh(hd);
	
	xsmcSetHostData(xsThis, hd);
}

void xs_HUB75_begin(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	hub75Begin((PixelsOut)hd, 
		xsmcToInteger(xsArg(0)), xsmcToInteger(xsArg(1)), 
		xsmcToInteger(xsArg(2)), xsmcToInteger(xsArg(3)));
}

void xs_HUB75_send(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	int offset = (xsmcArgc > 1) ? xsmcToInteger(xsArg(1)) : 0;
	int count = (xsmcArgc > 2) ? xsmcToInteger(xsArg(2)) : (xsmcToArrayBuffer(xsArg(0)) - offset);
	
	hub75Send((PixelsOut)hd, (uint8_t*)xsmcToArrayBuffer(xsArg(0)) + offset, offset, count);
}

void xs_HUB75_end(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	hub75End((PixelsOut)hd);
}

void xs_HUB75_adaptInvalid(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	CommodettoRectangle invalid = xsmcGetHostChunk(xsArg(0));
	hub75AdaptInvalid((PixelsOut)hd, invalid);
}

void xs_HUB75_get_width(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	xsmcSetInteger(xsResult, hd->config.width);
}

void xs_HUB75_get_height(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	xsmcSetInteger(xsResult, hd->config.height);
}

void xs_HUB75_get_pixelFormat(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	xsmcSetInteger(xsResult, hd->config.pixelFormat);
}

void xs_HUB75_get_c_dispatch(xsMachine *the)
{
	xsmcSetHostData(xsResult, (void *)&gPixelsOutDispatch);
}

void xs_HUB75_close(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	if (hd) {
		xs_HUB75_destructor(hd);
		xsmcSetHostData(xsThis, NULL);
	}
}

void xs_HUB75_get_brightness(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	xsmcSetInteger(xsResult, hd->config.brightness);
}

void xs_HUB75_set_brightness(xsMachine *the)
{
	HUB75Display hd = (HUB75Display)xsmcGetHostData(xsThis);
	int brightness = xsmcToInteger(xsArg(0));
	
	if (brightness < 0) brightness = 0;
	if (brightness > 255) brightness = 255;
	
	hd->config.brightness = brightness;
	hd->oeTime = (hd->rowTime * hd->config.brightness) / 255;
}

// Implementation of PixelsOut interface
void hub75Begin(PixelsOut po, CommodettoCoordinate x, CommodettoCoordinate y, CommodettoDimension w, CommodettoDimension h)
{
	// HUB75 always updates full display, so we ignore the rectangle
	// This is where we could implement partial updates in the future
}

void hub75Send(PixelsOut po, uint8_t *data, uint32_t offset, uint32_t count)
{
	HUB75Display hd = (HUB75Display)po;
	
	// Copy pixel data to back buffer
	if (offset + count <= hd->bufferSize) {
		memcpy(hd->backBuffer + offset, data, count);
	}
}

void hub75End(PixelsOut po)
{
	HUB75Display hd = (HUB75Display)po;
	
	// Swap buffers
	uint8_t *temp = hd->frontBuffer;
	hd->frontBuffer = hd->backBuffer;
	hd->backBuffer = temp;
	
	hd->frameReady = 1;
}

void hub75AdaptInvalid(PixelsOut po, CommodettoRectangle invalid)
{
	// HUB75 always refreshes the full display
	// Could be optimized for partial updates
}

// GPIO initialization
static void hub75InitGPIO(HUB75Display hd)
{
	// Initialize data pins
	modGPIOInit(&hd->r1, MODDEF_HUB75_R1_PORT, MODDEF_HUB75_R1_PIN, kModGPIOOutput);
	modGPIOInit(&hd->g1, MODDEF_HUB75_G1_PORT, MODDEF_HUB75_G1_PIN, kModGPIOOutput);
	modGPIOInit(&hd->b1, MODDEF_HUB75_B1_PORT, MODDEF_HUB75_B1_PIN, kModGPIOOutput);
	modGPIOInit(&hd->r2, MODDEF_HUB75_R2_PORT, MODDEF_HUB75_R2_PIN, kModGPIOOutput);
	modGPIOInit(&hd->g2, MODDEF_HUB75_G2_PORT, MODDEF_HUB75_G2_PIN, kModGPIOOutput);
	modGPIOInit(&hd->b2, MODDEF_HUB75_B2_PORT, MODDEF_HUB75_B2_PIN, kModGPIOOutput);
	
	// Initialize address pins
	modGPIOInit(&hd->a, MODDEF_HUB75_A_PORT, MODDEF_HUB75_A_PIN, kModGPIOOutput);
	modGPIOInit(&hd->b, MODDEF_HUB75_B_PORT, MODDEF_HUB75_B_PIN, kModGPIOOutput);
	modGPIOInit(&hd->c, MODDEF_HUB75_C_PORT, MODDEF_HUB75_C_PIN, kModGPIOOutput);
	modGPIOInit(&hd->d, MODDEF_HUB75_D_PORT, MODDEF_HUB75_D_PIN, kModGPIOOutput);
	if (hd->config.hasE)
		modGPIOInit(&hd->e, MODDEF_HUB75_E_PORT, MODDEF_HUB75_E_PIN, kModGPIOOutput);
	
	// Initialize control pins
	modGPIOInit(&hd->clk, MODDEF_HUB75_CLK_PORT, MODDEF_HUB75_CLK_PIN, kModGPIOOutput);
	modGPIOInit(&hd->latch, MODDEF_HUB75_LATCH_PORT, MODDEF_HUB75_LATCH_PIN, kModGPIOOutput);
	modGPIOInit(&hd->oe, MODDEF_HUB75_OE_PORT, MODDEF_HUB75_OE_PIN, kModGPIOOutput);
	
	// Set initial states
	SET_PIN(clk, 0);
	SET_PIN(latch, 0);
	SET_PIN(oe, 1);  // Output enable is active low
	SET_ROW_PINS(0);
}

static void hub75UninitGPIO(HUB75Display hd)
{
	modGPIOUninit(&hd->r1);
	modGPIOUninit(&hd->g1);
	modGPIOUninit(&hd->b1);
	modGPIOUninit(&hd->r2);
	modGPIOUninit(&hd->g2);
	modGPIOUninit(&hd->b2);
	modGPIOUninit(&hd->a);
	modGPIOUninit(&hd->b);
	modGPIOUninit(&hd->c);
	modGPIOUninit(&hd->d);
	if (hd->config.hasE)
		modGPIOUninit(&hd->e);
	modGPIOUninit(&hd->clk);
	modGPIOUninit(&hd->latch);
	modGPIOUninit(&hd->oe);
}

// Refresh timer callback
static void hub75RefreshTimer(modTimer timer, void *refcon, int refconSize)
{
	HUB75Display hd = (HUB75Display)refcon;
	hub75RefreshRow(hd);
}

void hub75RefreshRow(HUB75Display hd)
{
	if (!hd->refreshActive) return;
	
	// Disable output
	SET_PIN(oe, 1);
	
	// Set row address
	SET_ROW_PINS(hd->currentRow);
	
	// Push pixel data for current row
	hub75PushPixels(hd, hd->currentRow);
	
	// Latch data
	SET_PIN(latch, 1);
	modDelayMicroseconds(HUB75_LATCH_PULSE_US);
	SET_PIN(latch, 0);
	
	// Enable output for brightness control
	SET_PIN(oe, 0);
	modDelayMicroseconds(hd->oeTime);
	SET_PIN(oe, 1);
	
	// Move to next row
	hd->currentRow++;
	if (hd->currentRow >= (hd->config.height / 2)) {
		hd->currentRow = 0;
	}
}

static void hub75PushPixels(HUB75Display hd, uint8_t row)
{
	uint32_t width = hd->config.width;
	uint32_t height = hd->config.height;
	uint8_t *buffer = hd->frontBuffer;
	
	// HUB75 displays both top and bottom half simultaneously
	uint32_t topRowOffset = row * width;
	uint32_t bottomRowOffset = (row + height/2) * width;
	
	for (uint32_t col = 0; col < width; col++) {
		uint32_t topPixelIndex = (topRowOffset + col);
		uint32_t bottomPixelIndex = (bottomRowOffset + col);
		
		// Extract RGB values (assuming RGB565)
		uint16_t topPixel = ((uint16_t*)buffer)[topPixelIndex];
		uint16_t bottomPixel = ((uint16_t*)buffer)[bottomPixelIndex];
		
		uint8_t topR = hub75GammaCorrect((topPixel >> 11) << 3);
		uint8_t topG = hub75GammaCorrect(((topPixel >> 5) & 0x3F) << 2);
		uint8_t topB = hub75GammaCorrect((topPixel & 0x1F) << 3);
		
		uint8_t bottomR = hub75GammaCorrect((bottomPixel >> 11) << 3);
		uint8_t bottomG = hub75GammaCorrect(((bottomPixel >> 5) & 0x3F) << 2);
		uint8_t bottomB = hub75GammaCorrect((bottomPixel & 0x1F) << 3);
		
		// Set data pins (simple 1-bit output for now)
		SET_PIN(r1, topR > 127);
		SET_PIN(g1, topG > 127);
		SET_PIN(b1, topB > 127);
		SET_PIN(r2, bottomR > 127);
		SET_PIN(g2, bottomG > 127);
		SET_PIN(b2, bottomB > 127);
		
		// Clock data
		SET_PIN(clk, 1);
		modDelayMicroseconds(HUB75_CLK_PULSE_US);
		SET_PIN(clk, 0);
		modDelayMicroseconds(HUB75_CLK_PULSE_US);
	}
}

static uint8_t hub75GammaCorrect(uint8_t value)
{
	return gammaTable[value];
}

void hub75StartRefresh(HUB75Display hd)
{
	if (hd->refreshActive) return;
	
	hd->refreshActive = 1;
	hd->currentRow = 0;
	
	// Start refresh timer
	modTimerAdd(hd->rowTime, hub75RefreshTimer, hd, sizeof(HUB75Display));
}

void hub75StopRefresh(HUB75Display hd)
{
	if (!hd->refreshActive) return;
	
	hd->refreshActive = 0;
	modTimerRemove(hub75RefreshTimer, hd, sizeof(HUB75Display));
	
	// Turn off display
	SET_PIN(oe, 1);
}