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

#ifndef MODHUB75_H
#define MODHUB75_H

#include "stdint.h"
#include "commodettoPixelsOut.h"
#include "modGPIO.h"

// Default configuration values
#ifndef MODDEF_HUB75_WIDTH
	#define MODDEF_HUB75_WIDTH (64)
#endif
#ifndef MODDEF_HUB75_HEIGHT
	#define MODDEF_HUB75_HEIGHT (32)
#endif
#ifndef MODDEF_HUB75_CHAINS
	#define MODDEF_HUB75_CHAINS (1)
#endif
#ifndef MODDEF_HUB75_BRIGHTNESS
	#define MODDEF_HUB75_BRIGHTNESS (128)
#endif
#ifndef MODDEF_HUB75_REFRESH_HZ
	#define MODDEF_HUB75_REFRESH_HZ (120)
#endif

// HUB75 pin definitions - must be defined in build
#ifndef MODDEF_HUB75_R1_PIN
	#error "MODDEF_HUB75_R1_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_G1_PIN
	#error "MODDEF_HUB75_G1_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_B1_PIN
	#error "MODDEF_HUB75_B1_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_R2_PIN
	#error "MODDEF_HUB75_R2_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_G2_PIN
	#error "MODDEF_HUB75_G2_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_B2_PIN
	#error "MODDEF_HUB75_B2_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_A_PIN
	#error "MODDEF_HUB75_A_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_B_PIN
	#error "MODDEF_HUB75_B_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_C_PIN
	#error "MODDEF_HUB75_C_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_D_PIN
	#error "MODDEF_HUB75_D_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_CLK_PIN
	#error "MODDEF_HUB75_CLK_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_LATCH_PIN
	#error "MODDEF_HUB75_LATCH_PIN must be defined"
#endif
#ifndef MODDEF_HUB75_OE_PIN
	#error "MODDEF_HUB75_OE_PIN must be defined"
#endif

// Optional E pin for 64-row panels
#ifndef MODDEF_HUB75_E_PIN
	#define MODDEF_HUB75_E_PIN (-1)
#endif

// GPIO port definitions (default to NULL for platform default)
#ifndef MODDEF_HUB75_R1_PORT
	#define MODDEF_HUB75_R1_PORT NULL
#endif
#ifndef MODDEF_HUB75_G1_PORT
	#define MODDEF_HUB75_G1_PORT NULL
#endif
#ifndef MODDEF_HUB75_B1_PORT
	#define MODDEF_HUB75_B1_PORT NULL
#endif
#ifndef MODDEF_HUB75_R2_PORT
	#define MODDEF_HUB75_R2_PORT NULL
#endif
#ifndef MODDEF_HUB75_G2_PORT
	#define MODDEF_HUB75_G2_PORT NULL
#endif
#ifndef MODDEF_HUB75_B2_PORT
	#define MODDEF_HUB75_B2_PORT NULL
#endif
#ifndef MODDEF_HUB75_A_PORT
	#define MODDEF_HUB75_A_PORT NULL
#endif
#ifndef MODDEF_HUB75_B_PORT
	#define MODDEF_HUB75_B_PORT NULL
#endif
#ifndef MODDEF_HUB75_C_PORT
	#define MODDEF_HUB75_C_PORT NULL
#endif
#ifndef MODDEF_HUB75_D_PORT
	#define MODDEF_HUB75_D_PORT NULL
#endif
#ifndef MODDEF_HUB75_E_PORT
	#define MODDEF_HUB75_E_PORT NULL
#endif
#ifndef MODDEF_HUB75_CLK_PORT
	#define MODDEF_HUB75_CLK_PORT NULL
#endif
#ifndef MODDEF_HUB75_LATCH_PORT
	#define MODDEF_HUB75_LATCH_PORT NULL
#endif
#ifndef MODDEF_HUB75_OE_PORT
	#define MODDEF_HUB75_OE_PORT NULL
#endif

// HUB75 display configuration
typedef struct {
	uint16_t width;
	uint16_t height;
	uint8_t chains;
	uint8_t brightness;
	uint16_t refreshHz;
	uint8_t pixelFormat;
	uint8_t hasE;  // True if E pin is connected (64-row panels)
} HUB75Config;

// HUB75 display record
typedef struct {
	PixelsOutDispatch dispatch;  // Must be first!
	
	// GPIO configurations
	modGPIOConfigurationRecord r1, g1, b1;
	modGPIOConfigurationRecord r2, g2, b2;
	modGPIOConfigurationRecord a, b, c, d, e;
	modGPIOConfigurationRecord clk, latch, oe;
	
	// Display configuration
	HUB75Config config;
	
	// Frame buffer (double buffered)
	uint8_t *frontBuffer;
	uint8_t *backBuffer;
	uint32_t bufferSize;
	
	// Refresh state
	uint8_t currentRow;
	uint8_t refreshActive;
	uint8_t frameReady;
	
	// Timing
	uint32_t rowTime;  // Microseconds per row
	uint32_t oeTime;   // Output enable pulse width
	
} HUB75Record, *HUB75Display;

// Function prototypes
void hub75Begin(PixelsOut po, CommodettoCoordinate x, CommodettoCoordinate y, CommodettoDimension w, CommodettoDimension h);
void hub75Send(PixelsOut po, uint8_t *data, uint32_t offset, uint32_t count);
void hub75End(PixelsOut po);
void hub75AdaptInvalid(PixelsOut po, CommodettoRectangle invalid);
void hub75RefreshRow(HUB75Display hd);
void hub75StartRefresh(HUB75Display hd);
void hub75StopRefresh(HUB75Display hd);

#endif // MODHUB75_H