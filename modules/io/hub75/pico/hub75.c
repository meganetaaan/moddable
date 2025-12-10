/*
 * HUB75 Controller (RP2040)
 *
 * Native driver skeleton that manages configuration parsing and prepares
 * hardware resources for PIO-based refresh. Frame generation and DMA driven
 * refresh will be implemented in a subsequent iteration.
 */

#include "xsmc.h"
#include "xsHost.h"
#include "mc.xs.h"

#include "builtinCommon.h"

#include <stdbool.h>
#include <string.h>

#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/clocks.h"
#include "hardware/gpio.h"

#include "modTimer.h"

#include "hub75.pio.h"

#ifndef xsID_pin
#define xsID_pin (xsID("pin"))
#endif
#ifndef xsID_data
#define xsID_data (xsID("data"))
#endif
#ifndef xsID_addr
#define xsID_addr (xsID("addr"))
#endif
#ifndef xsID_clk
#define xsID_clk (xsID("clk"))
#endif
#ifndef xsID_lat
#define xsID_lat (xsID("lat"))
#endif
#ifndef xsID_oe
#define xsID_oe (xsID("oe"))
#endif
#ifndef xsID_size
#define xsID_size (xsID("size"))
#endif
#ifndef xsID_width
#define xsID_width (xsID("width"))
#endif
#ifndef xsID_height
#define xsID_height (xsID("height"))
#endif
#ifndef xsID_colorDepth
#define xsID_colorDepth (xsID("colorDepth"))
#endif
#ifndef xsID_scanLines
#define xsID_scanLines (xsID("scanLines"))
#endif
#ifndef xsID_planeDurations
#define xsID_planeDurations (xsID("planeDurations"))
#endif
#ifndef xsID_length
#define xsID_length (xsID("length"))
#endif

#define HUB75_MAX_DATA_PINS 6
#define HUB75_MAX_ADDR_PINS 5
#define HUB75_MAX_PLANES    8
#define HUB75_MAX_WIDTH      128
#define HUB75_MAX_HEIGHT     (HUB75_MAX_WIDTH * 2)

typedef struct {
	uint8_t data[HUB75_MAX_DATA_PINS];
	uint8_t addr[HUB75_MAX_ADDR_PINS];
	uint8_t addrCount;
	uint8_t clk;
	uint8_t lat;
	uint8_t oe;
} Hub75Pins;

typedef struct {
	xsSlot target;
	Hub75Pins pins;
	uint32_t planeDurations[HUB75_MAX_PLANES];
	uint16_t width;
	uint16_t height;
	uint8_t planes;
	uint8_t scanLines;
	uint8_t running;
	PIO pio;
	int dataSM;
	int rowSM;
	uint dataOffset;
	uint rowOffset;
	uint8_t dataProgramLoaded;
	uint8_t rowProgramLoaded;
	modTimer timer;
	uint16_t *frame;
	uint16_t *nextFrame;
	uint32_t framePixels;
	uint32_t frameCapacity;
	uint8_t pendingFrameReady;
	uint8_t currentPlane;
	uint16_t currentRow;
	uint32_t rowCache[2][HUB75_MAX_WIDTH];
} Hub75Record, *Hub75;

static void hub75ReleaseHardware(Hub75 hub)
{
	if (!hub)
		return;

#if !PICO_NO_HARDWARE
	if (hub->pio) {
		if (hub->dataSM >= 0)
			pio_sm_unclaim(hub->pio, (uint)hub->dataSM);
		if (hub->rowSM >= 0)
			pio_sm_unclaim(hub->pio, (uint)hub->rowSM);
		if (hub->dataProgramLoaded)
			pio_remove_program(hub->pio, &hub75_data_rgb888_program, hub->dataOffset);
		if (hub->rowProgramLoaded)
			pio_remove_program(hub->pio, &hub75_row_program, hub->rowOffset);
	}
#endif

	hub->pio = NULL;
	hub->dataSM = -1;
	hub->rowSM = -1;
	hub->dataOffset = 0;
	hub->rowOffset = 0;
	hub->dataProgramLoaded = 0;
	hub->rowProgramLoaded = 0;
}

void xs_hub75_destructor_(void *data)
{
	Hub75 hub = data;
	if (!hub)
		return;

	if (hub->timer) {
		modTimerRemove(hub->timer);
		hub->timer = NULL;
	}

	hub75ReleaseHardware(hub);

	c_free(hub->frame);
	c_free(hub->nextFrame);

	c_free(hub);
}

static void hub75SetDefaults(Hub75 hub)
{
	hub->width = 64;
	hub->height = 32;
	hub->planes = 4;
	hub->scanLines = 16;
	hub->running = 0;
	hub->pio = NULL;
	hub->dataSM = -1;
	hub->rowSM = -1;
	hub->dataOffset = 0;
	hub->rowOffset = 0;
	hub->dataProgramLoaded = 0;
	hub->rowProgramLoaded = 0;
	hub->timer = NULL;
	hub->frame = NULL;
	hub->nextFrame = NULL;
	hub->framePixels = 0;
	hub->frameCapacity = 0;
	hub->pendingFrameReady = 0;
	hub->currentPlane = 0;
	hub->currentRow = 0;

	for (uint8_t i = 0; i < HUB75_MAX_DATA_PINS; i++)
		hub->pins.data[i] = i;
	hub->pins.addrCount = 4;
	for (uint8_t i = 0; i < hub->pins.addrCount; i++)
		hub->pins.addr[i] = 6 + i;
	hub->pins.clk = 11;
	hub->pins.lat = 12;
	hub->pins.oe = 13;

	uint32_t base = 4;
	for (uint8_t plane = 0; plane < HUB75_MAX_PLANES; plane++)
		hub->planeDurations[plane] = 100u * (1u << plane);
}

static Hub75 hub75Get(xsMachine *the)
{
	return xsmcGetHostDataValidate(xsThis, xs_hub75_destructor_);
}

static void hub75ValidatePins(xsMachine *the, const Hub75Pins *pins)
{
	for (uint8_t i = 1; i < HUB75_MAX_DATA_PINS; i++) {
		if (pins->data[i] != (uint8_t)(pins->data[0] + i))
			xsRangeError("data pins must be contiguous");
	}
	for (uint8_t i = 1; i < pins->addrCount; i++) {
		if (pins->addr[i] != (uint8_t)(pins->addr[0] + i))
			xsRangeError("addr pins must be contiguous");
	}
	if ((uint8_t)(pins->lat + 1) != pins->oe)
		xsRangeError("OE must be LAT+1");
}

static void hub75ParseOptions(xsMachine *the, Hub75 hub, xsSlot options)
{
	xsmcVars(4);
	bool scanLinesSet = false;
	bool planesSet = false;
	bool heightSet = false;

	if (xsmcHas(options, xsID_pin)) {
		xsmcGet(xsVar(0), options, xsID_pin);
		if (xsmcHas(xsVar(0), xsID_data)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_data);
			if (xsmcTypeOf(xsVar(1)) != xsReferenceType)
				xsTypeError("data pins must be array");
			xsmcGet(xsVar(2), xsVar(1), xsID_length);
			uint32_t length = (uint32_t)xsmcToInteger(xsVar(2));
			if (length > HUB75_MAX_DATA_PINS)
				xsRangeError("pin list too long");
			for (uint32_t i = 0; i < length; i++) {
				xsmcSetInteger(xsVar(2), (xsIntegerValue)i);
				xsmcGetAt(xsVar(3), xsVar(1), xsVar(2));
				hub->pins.data[i] = (uint8_t)xsmcToInteger(xsVar(3));
			}
		}
		if (xsmcHas(xsVar(0), xsID_addr)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_addr);
			if (xsmcTypeOf(xsVar(1)) != xsReferenceType)
				xsTypeError("addr pins must be array");
			xsmcGet(xsVar(2), xsVar(1), xsID_length);
			uint32_t length = (uint32_t)xsmcToInteger(xsVar(2));
			if (length > HUB75_MAX_ADDR_PINS)
				xsRangeError("pin list too long");
			hub->pins.addrCount = (uint8_t)length;
			for (uint32_t i = 0; i < length; i++) {
				xsmcSetInteger(xsVar(2), (xsIntegerValue)i);
				xsmcGetAt(xsVar(3), xsVar(1), xsVar(2));
				hub->pins.addr[i] = (uint8_t)xsmcToInteger(xsVar(3));
			}
		}
		if (xsmcHas(xsVar(0), xsID_clk)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_clk);
			hub->pins.clk = (uint8_t)xsmcToInteger(xsVar(1));
		}
		if (xsmcHas(xsVar(0), xsID_lat)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_lat);
			hub->pins.lat = (uint8_t)xsmcToInteger(xsVar(1));
		}
		if (xsmcHas(xsVar(0), xsID_oe)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_oe);
			hub->pins.oe = (uint8_t)xsmcToInteger(xsVar(1));
		}
	}

	if (xsmcHas(options, xsID_size)) {
		xsmcGet(xsVar(0), options, xsID_size);
		if (xsmcHas(xsVar(0), xsID_width)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_width);
			hub->width = (uint16_t)xsmcToInteger(xsVar(1));
		}
		if (xsmcHas(xsVar(0), xsID_height)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_height);
			hub->height = (uint16_t)xsmcToInteger(xsVar(1));
			heightSet = true;
		}
		if (xsmcHas(xsVar(0), xsID_colorDepth)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_colorDepth);
			hub->planes = (uint8_t)xsmcToInteger(xsVar(1));
			planesSet = true;
		}
		if (xsmcHas(xsVar(0), xsID_scanLines)) {
			xsmcGet(xsVar(1), xsVar(0), xsID_scanLines);
			hub->scanLines = (uint8_t)xsmcToInteger(xsVar(1));
			scanLinesSet = true;
		}
	}

	if (xsmcHas(options, xsID_planeDurations)) {
		xsmcGet(xsVar(0), options, xsID_planeDurations);
		if (xsmcTypeOf(xsVar(0)) != xsReferenceType)
			xsTypeError("planeDurations must be array");
		xsmcGet(xsVar(2), xsVar(0), xsID_length);
		uint32_t length = (uint32_t)xsmcToInteger(xsVar(2));
		if (length > HUB75_MAX_PLANES)
			xsRangeError("planeDurations too long");
		for (uint32_t i = 0; i < length; i++) {
			xsmcSetInteger(xsVar(2), (xsIntegerValue)i);
			xsmcGetAt(xsVar(3), xsVar(0), xsVar(2));
			hub->planeDurations[i] = (uint32_t)xsmcToInteger(xsVar(3));
		}
	}

	if (!scanLinesSet && heightSet)
		hub->scanLines = hub->height >> 1;

	if (!planesSet && hub->planes == 0)
		hub->planes = 4;

	if ((hub->planes == 0) || (hub->planes > HUB75_MAX_PLANES))
		xsRangeError("invalid colorDepth");

	if ((hub->scanLines == 0) || (hub->scanLines > hub->height))
		xsRangeError("invalid scanLines");
	if ((uint32_t)hub->scanLines * 2 != hub->height)
		xsRangeError("scanLines must equal height/2");

	hub75ValidatePins(the, &hub->pins);
}

static bool hub75ClaimStateMachines(Hub75 hub)
{
#if PICO_NO_HARDWARE
	(void)hub;
	return false;
#else
	PIO pio = pio0;
	int smData = pio_claim_unused_sm(pio, false);
	int smRow = pio_claim_unused_sm(pio, false);
	if ((smData < 0) || (smRow < 0)) {
		if (smData >= 0)
			pio_sm_unclaim(pio, (uint)smData);
		if (smRow >= 0)
			pio_sm_unclaim(pio, (uint)smRow);
		return false;
	}

	uint dataOffset = pio_add_program(pio, &hub75_data_rgb888_program);
	uint rowOffset = pio_add_program(pio, &hub75_row_program);

	hub->pio = pio;
	hub->dataSM = smData;
	hub->rowSM = smRow;
	hub->dataOffset = dataOffset;
	hub->rowOffset = rowOffset;
	hub->dataProgramLoaded = 1;
	hub->rowProgramLoaded = 1;

	uint8_t dataBase = hub->pins.data[0];
	hub75_data_rgb888_program_init(pio, (uint)smData, dataOffset, dataBase, hub->pins.clk);
	hub75_row_program_init(pio, (uint)smRow, rowOffset, hub->pins.addr[0], hub->pins.addrCount, hub->pins.lat);
	return true;
#endif
}

static void hub75EnsureBuffers(xsMachine *the, Hub75 hub)
{
	uint32_t needed = (uint32_t)hub->width * (uint32_t)hub->height;
	if (!needed)
		xsRangeError("invalid panel size");
	if ((hub->scanLines == 0) || (hub->scanLines > hub->height))
		xsRangeError("invalid scanLines");
	if ((hub->width > HUB75_MAX_WIDTH) || (hub->height > HUB75_MAX_HEIGHT))
		xsRangeError("panel too large");
	if (hub->frameCapacity != needed) {
		uint16_t *frame = c_malloc(needed * sizeof(uint16_t));
		uint16_t *next = c_malloc(needed * sizeof(uint16_t));
		if (!frame || !next) {
			c_free(frame);
			c_free(next);
			xsRangeError("no memory");
		}
		c_free(hub->frame);
		c_free(hub->nextFrame);
		hub->frame = frame;
		hub->nextFrame = next;
		hub->frameCapacity = needed;
	}
	if (hub->framePixels > hub->frameCapacity)
		hub->framePixels = hub->frameCapacity;
}

static void hub75CopyToBuffer(xsMachine *the, Hub75 hub, xsSlot slot, uint16_t *dest, bool updateSize)
{
	void *data;
	xsUnsignedValue length;
	xsmcGetBufferReadable(slot, &data, &length);
	if ((length & 1) || (length == 0))
		xsRangeError("invalid buffer");
	uint32_t pixels = (uint32_t)(length >> 1);
	uint32_t needed = (uint32_t)hub->width * (uint32_t)hub->height;
	if (pixels < needed)
		xsRangeError("buffer too small");
	c_memcpy(dest, data, needed * sizeof(uint16_t));
	if (updateSize)
		hub->framePixels = needed;
}

static inline uint32_t hub75GammaCorrect(uint16_t pix)
{
	uint32_t r = pix & 0xF800u;
	r *= r;
	uint32_t g = pix & 0x07E0u;
	g *= g;
	uint32_t b = pix & 0x001Fu;
	b *= b;
	return ((b >> 2) << 16) | ((g >> 14) << 8) | (r >> 24);
}

static void hub75PrepareRow(Hub75 hub, uint16_t row)
{
	uint32_t width = hub->width;
	uint16_t baseTop = row * width;
	uint16_t baseBottom = (row + hub->scanLines) * width;
	uint16_t *pixels = hub->frame;
	for (uint32_t x = 0; x < width; x++) {
		hub->rowCache[0][x] = hub75GammaCorrect(pixels[baseTop + x]);
		hub->rowCache[1][x] = hub75GammaCorrect(pixels[baseBottom + x]);
	}
}

static void hub75ApplyPending(Hub75 hub)
{
	if (!hub->pendingFrameReady)
		return;
	uint16_t *tmp = hub->frame;
	hub->frame = hub->nextFrame;
	hub->nextFrame = tmp;
	hub->pendingFrameReady = 0;
	hub->currentPlane = 0;
	hub->currentRow = 0;
}

static void hub75TimerCallback(modTimer timer, void *refcon, int refconSize)
{
	Hub75 hub = *(Hub75 *)refcon;
	(void)timer;
	(void)refconSize;
	if (!hub || !hub->running || !hub->frame)
		return;

#if PICO_NO_HARDWARE
	return;
#else
	if (!hub->pio)
		return;
	uint8_t plane = hub->currentPlane;
	uint16_t row = hub->currentRow;
	if (plane == 0)
		hub75PrepareRow(hub, row);

	hub75_data_rgb888_set_shift(hub->pio, (uint)hub->dataSM, hub->dataOffset, plane);
	uint32_t width = hub->width;
	for (uint32_t x = 0; x < width; x++) {
		pio_sm_put_blocking(hub->pio, (uint)hub->dataSM, hub->rowCache[0][x]);
		pio_sm_put_blocking(hub->pio, (uint)hub->dataSM, hub->rowCache[1][x]);
	}
	pio_sm_put_blocking(hub->pio, (uint)hub->dataSM, 0);
	pio_sm_put_blocking(hub->pio, (uint)hub->dataSM, 0);

	hub75_wait_tx_stall(hub->pio, (uint)hub->dataSM);
	hub75_wait_tx_stall(hub->pio, (uint)hub->rowSM);

	uint32_t duration = hub->planeDurations[plane];
	if (duration == 0)
		duration = 1;
	uint32_t value = row | ((duration - 1) << 5);
	pio_sm_put_blocking(hub->pio, (uint)hub->rowSM, value);

	plane++;
	if (plane >= hub->planes) {
		plane = 0;
		row++;
	if (row >= hub->scanLines) {
		row = 0;
		hub75ApplyPending(hub);
	}
}
hub->currentPlane = plane;
hub->currentRow = row;

modTimerReschedule(timer, 0, 0);
#endif
}

void xs_hub75_constructor_(xsMachine *the)
{
	Hub75 hub = c_calloc(1, sizeof(Hub75Record));
	if (!hub)
		xsRangeError("no memory");

	hub75SetDefaults(hub);

	hub->target = xsThis;
	xsRemember(hub->target);

	xsmcSetHostData(xsThis, hub);
	xsmcSetHostDestructor(xsThis, xs_hub75_destructor_);
}

void xs_hub75_close_(xsMachine *the)
{
	Hub75 hub = xsmcGetHostData(xsThis);
	if (!hub)
		return;

	if (xsmcGetHostDataValidate(xsThis, xs_hub75_destructor_)) {
		if (hub->timer) {
			modTimerRemove(hub->timer);
			hub->timer = NULL;
		}
		hub75ReleaseHardware(hub);
		xsForget(hub->target);
		hub->target = xsUndefined;
		xsmcSetHostData(xsThis, NULL);
		xsmcSetHostDestructor(xsThis, NULL);
		xs_hub75_destructor_(hub);
	}
}

void xs_hub75_configure_(xsMachine *the)
{
	Hub75 hub = hub75Get(the);
	if (!xsmcArgc || xsmcTypeOf(xsArg(0)) != xsReferenceType)
		return;

	hub75ParseOptions(the, hub, xsArg(0));
	hub75EnsureBuffers(the, hub);
}

void xs_hub75_start_(xsMachine *the)
{
	Hub75 hub = hub75Get(the);
	if (hub->running)
		return;

	if (!xsmcArgc || xsmcTypeOf(xsArg(0)) != xsReferenceType)
		xsTypeError("ArrayBuffer required");

	hub75EnsureBuffers(the, hub);
	hub75CopyToBuffer(the, hub, xsArg(0), hub->frame, true);
	hub->currentPlane = 0;
	hub->currentRow = 0;
	hub->pendingFrameReady = 0;

#if PICO_NO_HARDWARE
	xsUnknownError("Hub75 unavailable on this platform");
#else
	if (!hub75ClaimStateMachines(hub))
		xsUnknownError("unable to claim PIO state machine");

	if (!hub->timer) {
		hub->timer = modTimerAdd(0, 0, hub75TimerCallback, &hub, sizeof(hub));
		if (!hub->timer) {
			hub75ReleaseHardware(hub);
			xsUnknownError("timer alloc failed");
		}
	}
	hub->running = 1;
#endif
}

void xs_hub75_stop_(xsMachine *the)
{
	Hub75 hub = hub75Get(the);
	if (!hub->running)
		return;

	if (hub->timer) {
		modTimerRemove(hub->timer);
		hub->timer = NULL;
	}
	hub75ReleaseHardware(hub);
	hub->running = 0;
	hub->pendingFrameReady = 0;
	hub->currentPlane = 0;
	hub->currentRow = 0;
}

void xs_hub75_swap_(xsMachine *the)
{
	Hub75 hub = hub75Get(the);
	if (!xsmcArgc || xsmcTypeOf(xsArg(0)) != xsReferenceType)
		xsTypeError("ArrayBuffer expected");

	hub75EnsureBuffers(the, hub);
	if (!hub->running) {
		hub75CopyToBuffer(the, hub, xsArg(0), hub->frame, true);
		hub->currentPlane = hub->currentRow = 0;
		hub->pendingFrameReady = 0;
		return;
	}

	hub75CopyToBuffer(the, hub, xsArg(0), hub->nextFrame, false);
	hub->pendingFrameReady = 1;
}

void xs_hub75_setPlaneDurations_(xsMachine *the)
{
	Hub75 hub = hub75Get(the);
	if (!xsmcArgc || xsmcTypeOf(xsArg(0)) != xsReferenceType)
		xsTypeError("array required");

	xsmcVars(3);
	xsmcGet(xsVar(0), xsArg(0), xsID_length);
	uint32_t length = (uint32_t)xsmcToInteger(xsVar(0));
	if (length > HUB75_MAX_PLANES)
		xsRangeError("planeDurations too long");
	for (uint32_t i = 0; i < length; i++) {
		xsmcSetInteger(xsVar(1), (xsIntegerValue)i);
		xsmcGetAt(xsVar(2), xsArg(0), xsVar(1));
		hub->planeDurations[i] = (uint32_t)xsmcToInteger(xsVar(2));
	}
	if (length == 0)
		return;
	for (uint32_t i = length; i < hub->planes; i++)
		hub->planeDurations[i] = hub->planeDurations[length - 1];
}
