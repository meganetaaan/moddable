/*
 * Copyright (c) 2026  Moddable Tech, Inc.
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
#include "builtinCommon.h"
#include "display419.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_hosted.h"
#include "esp_attr.h"
#include "esp_lcd_ili9881c.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_st7121.h"
#include "esp_lcd_st7123.h"
#include "esp_ldo_regulator.h"
#include "esp_log.h"

#include "panel_init.h"

#define TAB5_WIDTH 720
#define TAB5_HEIGHT 1280

typedef enum {
	kTab5PanelILI9881C,
	kTab5PanelST7121,
	kTab5PanelST7123,
} tab5Panel;

typedef struct {
	esp_lcd_panel_handle_t panel;
	esp_lcd_panel_io_handle_t io;
	esp_lcd_dsi_bus_handle_t bus;
	esp_ldo_channel_handle_t ldo;
	void *frameBuffer;
	uint16_t updateX;
	uint16_t updateY;
	uint16_t updateWidth;
	uint16_t updateHeight;
	uint8_t format;
	uint8_t didBegin;
	uint8_t direct;
	uint8_t dma2d;
} modDisplayRecord, *modDisplay;

static uint8_t gBoardReady;
static volatile uint8_t gHostedConnected;
static uint8_t gHostedStarted;
// ESP-IDF v6.0.2 rejects flash operations when FreeRTOS allocates a task stack in SPM.
static volatile uint8_t SPM_DRAM_ATTR gSPMReserve[0x1E00];
static tab5Panel gPanel = kTab5PanelILI9881C;
static const char *gTag = "m5stack-tab5";

static esp_err_t tab5I2CGetBus(i2c_master_bus_handle_t *bus)
{
	esp_err_t err = i2c_master_get_bus_handle(I2C_NUM_1, bus);
	if (ESP_ERR_INVALID_STATE == err) {
		const i2c_master_bus_config_t config = {
			.i2c_port = I2C_NUM_1,
			.sda_io_num = GPIO_NUM_31,
			.scl_io_num = GPIO_NUM_32,
			.clk_source = I2C_CLK_SRC_DEFAULT,
			.glitch_ignore_cnt = 7,
			.flags.enable_internal_pullup = 1,
		};
		err = i2c_new_master_bus(&config, bus);
	}
	return err;
}

i2c_master_bus_handle_t modI2CGetExternalBus(i2c_port_num_t port, uint32_t data, uint32_t clock)
{
	i2c_master_bus_handle_t bus = C_NULL;

	if ((I2C_NUM_1 == port) && (31 == data) && (32 == clock))
		tab5I2CGetBus(&bus);
	return bus;
}

static int displayBegin(void *hostData, int x, int y, int width, int height, void **frameBuffer, int32_t *rowBytes, int flags);
static int displaySend(void *hostData, void *buffer, uint32_t length);
static int displayEnd(void *hostData);
static void displayAdaptInvalid(void *hostData, CommodettoRectangle r);
static int displayGet(void *hostData, int32_t what, void *result);

void xs_display_destructor(void *data);

static const xsDisplayHostHooksRecord xsDisplayHooks = {
	.hooks = {
		xs_display_destructor,
		C_NULL,
		"display"
	},
	.doBegin = displayBegin,
	.doSend = displaySend,
	.doEnd = displayEnd,
	.doAdaptInvalid = displayAdaptInvalid,
	.doGet = displayGet,
};

static esp_err_t tab5WriteRegister(i2c_master_dev_handle_t device, uint8_t reg, uint8_t value)
{
	const uint8_t data[] = {reg, value};
	return i2c_master_transmit(device, data, sizeof(data), 100);
}

static esp_err_t tab5BoardPrepare(void)
{
	(void)gSPMReserve[0];
	static const uint8_t io1[][2] = {
		{0x03, 0x73}, {0x05, 0x40}, {0x07, 0x08}, {0x0D, 0x04}, {0x0B, 0x04}
	};
	static const uint8_t io2[][2] = {
		{0x03, 0xB1}, {0x05, 0x81}, {0x07, 0x06}, {0x0D, 0x08}, {0x0B, 0x08}
	};
	i2c_master_bus_handle_t bus = C_NULL;
	i2c_master_dev_handle_t expander1 = C_NULL;
	i2c_master_dev_handle_t expander2 = C_NULL;
	i2c_master_dev_handle_t touch = C_NULL;
	esp_err_t err;

	if (gBoardReady)
		return ESP_OK;

	err = gpio_set_direction(GPIO_NUM_23, GPIO_MODE_OUTPUT);
	if (ESP_OK != err)
		return err;
	err = gpio_set_level(GPIO_NUM_23, 1);
	if (ESP_OK != err)
		goto done;

	err = tab5I2CGetBus(&bus);
	if (ESP_OK != err)
		goto done;

	i2c_device_config_t deviceConfig = {
		.dev_addr_length = I2C_ADDR_BIT_LEN_7,
		.device_address = 0x43,
		.scl_speed_hz = 100000,
	};
	err = i2c_master_bus_add_device(bus, &deviceConfig, &expander1);
	if (ESP_OK != err)
		goto done;
	deviceConfig.device_address = 0x44;
	err = i2c_master_bus_add_device(bus, &deviceConfig, &expander2);
	if (ESP_OK != err)
		goto done;

	uint8_t reg = 1;
	uint8_t value;
	err = i2c_master_transmit_receive(expander1, &reg, 1, &value, 1, 100);
	if (ESP_OK != err)
		goto done;
	err = i2c_master_transmit_receive(expander2, &reg, 1, &value, 1, 100);
	if (ESP_OK != err)
		goto done;

	for (size_t i = 0; i < sizeof(io1) / sizeof(io1[0]); i++) {
		err = tab5WriteRegister(expander1, io1[i][0], io1[i][1]);
		if (ESP_OK != err)
			goto done;
	}
	for (size_t i = 0; i < sizeof(io2) / sizeof(io2[0]); i++) {
		err = tab5WriteRegister(expander2, io2[i][0], io2[i][1]);
		if (ESP_OK != err)
			goto done;
	}
	vTaskDelay(pdMS_TO_TICKS(10));
	err = tab5WriteRegister(expander1, 0x05, 0x70);
	if (ESP_OK != err)
		goto done;
	err = gpio_set_direction(GPIO_NUM_23, GPIO_MODE_INPUT);
	if (ESP_OK != err)
		goto done;
	vTaskDelay(pdMS_TO_TICKS(100));

	gPanel = kTab5PanelILI9881C;
	deviceConfig.device_address = 0x55;
	deviceConfig.scl_speed_hz = 400000;
	err = i2c_master_bus_add_device(bus, &deviceConfig, &touch);
	if (ESP_OK == err) {
		const uint8_t fwRegister[] = {0, 0};
		for (int i = 0; i < 3; i++) {
			err = i2c_master_transmit_receive(touch, fwRegister, sizeof(fwRegister), &value, 1, 100);
			if (ESP_OK == err) {
				if (1 == value)
					gPanel = kTab5PanelST7121;
				else if (3 == value)
					gPanel = kTab5PanelST7123;
				break;
			}
			vTaskDelay(pdMS_TO_TICKS(10));
		}
	}
	if (kTab5PanelILI9881C == gPanel) {
		// Tab5 v1 requires its GT911 interrupt pin to be held low.
		err = gpio_set_direction(GPIO_NUM_23, GPIO_MODE_OUTPUT);
		if (ESP_OK == err)
			err = gpio_set_level(GPIO_NUM_23, 0);
		if (ESP_OK != err)
			goto done;
	}
	err = ESP_OK;
	gBoardReady = 1;

done:
	if (touch)
		i2c_master_bus_rm_device(touch);
	if (expander2)
		i2c_master_bus_rm_device(expander2);
	if (expander1)
		i2c_master_bus_rm_device(expander1);
	if (ESP_OK != err)
		gpio_set_direction(GPIO_NUM_23, GPIO_MODE_INPUT);
	return err;
}

void xs_m5stack_tab5_prepare(xsMachine *the)
{
	if (ESP_OK != tab5BoardPrepare())
		xsUnknownError("can't prepare board");
	xsmcSetInteger(xsResult, gPanel);
}

static void tab5HostedEvent(void *arg, esp_event_base_t base, int32_t id, void *data)
{
	if (ESP_HOSTED_EVENT_TRANSPORT_UP == id)
		gHostedConnected = 1;
}

esp_err_t modWiFiPlatformInit(void)
{
	esp_err_t err;

	if (gHostedConnected)
		return ESP_OK;
	err = tab5BoardPrepare();
	if (ESP_OK != err)
		return err;
	if (!gHostedStarted) {
		err = esp_event_handler_register(ESP_HOSTED_EVENT, ESP_EVENT_ANY_ID, tab5HostedEvent, NULL);
		if (ESP_OK != err)
			return err;
		err = esp_hosted_init();
		if (ESP_OK != err) {
			esp_event_handler_unregister(ESP_HOSTED_EVENT, ESP_EVENT_ANY_ID, tab5HostedEvent);
			return err;
		}
		gHostedStarted = 1;
	}
	err = esp_hosted_connect_to_slave();
	if (ESP_OK != err)
		return err;
	for (int retry = 0; retry < 1000; retry++) {
		if (gHostedConnected)
			return ESP_OK;
		vTaskDelay(pdMS_TO_TICKS(10));
	}
	return ESP_ERR_TIMEOUT;
}

static uint8_t tab5IsILI9881C(esp_lcd_panel_io_handle_t io)
{
	const uint8_t page1[] = {0x98, 0x81, 0x01};
	const uint8_t page0[] = {0x98, 0x81, 0x00};
	uint8_t id[3];

	vTaskDelay(pdMS_TO_TICKS(80));
	for (int attempt = 0; attempt < 3; attempt++) {
		if ((ESP_OK == esp_lcd_panel_io_tx_param(io, 0xFF, page1, sizeof(page1))) &&
			(ESP_OK == esp_lcd_panel_io_rx_param(io, 0x00, id, 1)) &&
			(ESP_OK == esp_lcd_panel_io_rx_param(io, 0x01, id + 1, 1)) &&
			(ESP_OK == esp_lcd_panel_io_rx_param(io, 0x02, id + 2, 1))) {
			esp_lcd_panel_io_tx_param(io, 0xFF, page0, sizeof(page0));
			if ((0x98 == id[0]) && (0x81 == id[1]))
				return 1;
		}
		else
			esp_lcd_panel_io_tx_param(io, 0xFF, page0, sizeof(page0));
	}
	return 0;
}

static esp_err_t tab5DisplayCreate(modDisplay display)
{
	esp_err_t err = tab5BoardPrepare();
	if (ESP_OK != err)
		return err;

	const esp_ldo_channel_config_t ldoConfig = {
		.chan_id = 3,
		.voltage_mv = 2500,
	};
	err = esp_ldo_acquire_channel(&ldoConfig, &display->ldo);
	if (ESP_OK != err)
		return err;

	const esp_lcd_dsi_bus_config_t busConfig = {
		.bus_id = 0,
		.num_data_lanes = 2,
		.phy_clk_src = MIPI_DSI_PHY_CLK_SRC_DEFAULT,
		.lane_bit_rate_mbps = (kTab5PanelST7121 == gPanel) ? 900 : 1040,
	};
	err = esp_lcd_new_dsi_bus(&busConfig, &display->bus);
	if (ESP_OK != err)
		return err;

	const esp_lcd_dbi_io_config_t ioConfig = {
		.virtual_channel = 0,
		.lcd_cmd_bits = 8,
		.lcd_param_bits = 8,
	};
	err = esp_lcd_new_panel_io_dbi(display->bus, &ioConfig, &display->io);
	if (ESP_OK != err)
		return err;
	if ((kTab5PanelILI9881C == gPanel) && !tab5IsILI9881C(display->io))
		return ESP_ERR_NOT_FOUND;

	float dpiClock;
	uint16_t hBack;
	uint16_t hPulse;
	uint16_t hFront;
	uint16_t vBack;
	uint16_t vPulse;
	uint16_t vFront;
	if (kTab5PanelILI9881C == gPanel) {
		dpiClock = 80;
		hBack = 140; hPulse = 40; hFront = 40;
		vBack = 20; vPulse = 4; vFront = 20;
	}
	else if (kTab5PanelST7121 == gPanel) {
		dpiClock = 70;
		hBack = 40; hPulse = 2; hFront = 40;
		vBack = 24; vPulse = 20; vFront = 200;
	}
	else {
		dpiClock = 80;
		hBack = 40; hPulse = 2; hFront = 40;
		vBack = 8; vPulse = 2; vFront = 220;
	}
	const esp_lcd_dpi_panel_config_t dpiConfig = {
		.virtual_channel = 0,
		.dpi_clk_src = MIPI_DSI_DPI_CLK_SRC_DEFAULT,
		.dpi_clock_freq_mhz = dpiClock,
		.in_color_format = LCD_COLOR_FMT_RGB565,
		.out_color_format = LCD_COLOR_FMT_RGB565,
		.num_fbs = 1,
		.video_timing = {
			.h_size = TAB5_WIDTH,
			.v_size = TAB5_HEIGHT,
			.hsync_pulse_width = hPulse,
			.hsync_back_porch = hBack,
			.hsync_front_porch = hFront,
			.vsync_pulse_width = vPulse,
			.vsync_back_porch = vBack,
			.vsync_front_porch = vFront,
		},
	};
	esp_lcd_panel_dev_config_t panelConfig = {
		.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB,
		.data_endian = LCD_RGB_DATA_ENDIAN_LITTLE,
		.bits_per_pixel = 16,
		.reset_gpio_num = -1,
	};

	if (kTab5PanelILI9881C == gPanel) {
		const ili9881c_vendor_config_t vendorConfig = {
			.init_cmds = gILI9881CInit,
			.init_cmds_size = sizeof(gILI9881CInit) / sizeof(gILI9881CInit[0]),
			.mipi_config = {.dsi_bus = display->bus, .dpi_config = &dpiConfig, .lane_num = 2},
		};
		panelConfig.vendor_config = (void *)&vendorConfig;
		err = esp_lcd_new_panel_ili9881c(display->io, &panelConfig, &display->panel);
	}
	else if (kTab5PanelST7121 == gPanel) {
		const st7121_vendor_config_t vendorConfig = {
			.mipi_config = {.dsi_bus = display->bus, .dpi_config = &dpiConfig},
		};
		panelConfig.vendor_config = (void *)&vendorConfig;
		err = esp_lcd_new_panel_st7121(display->io, &panelConfig, &display->panel);
	}
	else {
		const st7123_vendor_config_t vendorConfig = {
			.init_cmds = gST7123Init,
			.init_cmds_size = sizeof(gST7123Init) / sizeof(gST7123Init[0]),
			.mipi_config = {.dsi_bus = display->bus, .dpi_config = &dpiConfig},
		};
		panelConfig.vendor_config = (void *)&vendorConfig;
		err = esp_lcd_new_panel_st7123(display->io, &panelConfig, &display->panel);
	}
	if (ESP_OK != err)
		return err;
	err = esp_lcd_dpi_panel_enable_dma2d(display->panel);
	if (ESP_OK != err)
		return err;
	display->dma2d = 1;
	err = esp_lcd_dpi_panel_get_frame_buffer(display->panel, 1, &display->frameBuffer);
	if (ESP_OK != err)
		return err;
	err = esp_lcd_panel_reset(display->panel);
	if (ESP_OK == err)
		err = esp_lcd_panel_init(display->panel);
	if (ESP_OK == err)
		err = esp_lcd_panel_disp_on_off(display->panel, true);
	if (ESP_OK == err)
		ESP_LOGI(gTag, "display initialized: %s", (kTab5PanelILI9881C == gPanel) ? "ILI9881C" : ((kTab5PanelST7121 == gPanel) ? "ST7121" : "ST7123"));
	return err;
}

void xs_display_destructor(void *data)
{
	modDisplay display = data;
	if (!display)
		return;
	if (display->panel) {
		esp_lcd_panel_disp_on_off(display->panel, false);
		if (display->dma2d)
			esp_lcd_dpi_panel_disable_dma2d(display->panel);
		esp_lcd_panel_del(display->panel);
	}
	if (display->io)
		esp_lcd_panel_io_del(display->io);
	if (display->bus)
		esp_lcd_del_dsi_bus(display->bus);
	if (display->ldo)
		esp_ldo_release_channel(display->ldo);
	c_free(display);
}

void xs_display_constructor(xsMachine *the)
{
	modDisplay display = c_calloc(1, sizeof(modDisplayRecord));
	if (!display)
		xsUnknownError("no memory");
	display->format = kCommodettoBitmapRGB565LE;

	esp_err_t err = tab5DisplayCreate(display);
	if (ESP_OK != err) {
		xs_display_destructor(display);
		xsUnknownError("can't initialize display");
	}
	xsmcSetHostData(xsThis, display);
	xsSetHostHooks(xsThis, &xsDisplayHooks.hooks);
}

void xs_display_close(xsMachine *the)
{
	modDisplay display = xsmcGetHostData(xsThis);
	if (display && xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks)) {
		xs_display_destructor(display);
		xsmcSetHostData(xsThis, C_NULL);
		xsSetHostDestructor(xsThis, C_NULL);
	}
}

void xs_display_configure(xsMachine *the)
{
	modDisplay display = xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	xsmcVars(1);

	if (xsmcGet(xsVar(0), xsArg(0), xsID_format) && (xsUndefinedType != xsmcTypeOf(xsVar(0)))) {
		if (kCommodettoBitmapRGB565LE != xsmcToInteger(xsVar(0)))
			xsRangeError("invalid format");
		display->format = kCommodettoBitmapRGB565LE;
	}
	if (xsmcGet(xsVar(0), xsArg(0), xsID_rotation) && (xsUndefinedType != xsmcTypeOf(xsVar(0))) && (0 != xsmcToInteger(xsVar(0))))
		xsRangeError("invalid rotation");
}

void xs_display_configuration(xsMachine *the)
{
	modDisplay display = xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	xsmcVars(1);
	xsmcSetNewObject(xsResult);
	xsmcSetInteger(xsVar(0), display->format);
	xsmcSet(xsResult, xsID_format, xsVar(0));
	xsmcSetInteger(xsVar(0), 0);
	xsmcSet(xsResult, xsID_rotation, xsVar(0));
}

void xs_display_begin(xsMachine *the)
{
	modDisplay display = xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	xsmcVars(1);
	int x = 0;
	int y = 0;
	int width = TAB5_WIDTH;
	int height = TAB5_HEIGHT;

	if (xsmcArgc) {
		xsmcGet(xsVar(0), xsArg(0), xsID_x); x = xsmcToInteger(xsVar(0));
		xsmcGet(xsVar(0), xsArg(0), xsID_y); y = xsmcToInteger(xsVar(0));
		xsmcGet(xsVar(0), xsArg(0), xsID_width); width = xsmcToInteger(xsVar(0));
		xsmcGet(xsVar(0), xsArg(0), xsID_height); height = xsmcToInteger(xsVar(0));
	}
	if (displayBegin(display, x, y, width, height, C_NULL, C_NULL, 0))
		xsRangeError("invalid");
}

void xs_display_send(xsMachine *the)
{
	modDisplay display = xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	void *buffer;
	xsUnsignedValue length;
	xsmcGetBufferReadable(xsArg(0), &buffer, &length);

	if (xsmcArgc >= 3) {
		int offset = xsmcToInteger(xsArg(1));
		int requested = xsmcToInteger(xsArg(2));
		if ((offset < 0) || (requested <= 0) || ((xsUnsignedValue)offset > length) || ((xsUnsignedValue)requested > (length - offset)))
			xsRangeError("invalid");
		buffer = (uint8_t *)buffer + offset;
		length = requested;
	}
	if ((length > UINT32_MAX) || displaySend(display, buffer, (uint32_t)length))
		xsRangeError("invalid");
}

void xs_display_end(xsMachine *the)
{
	modDisplay display = xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	if (displayEnd(display))
		xsUnknownError("invalid");
}

void xs_display_adaptInvalid(xsMachine *the)
{
	modDisplay display = xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	displayAdaptInvalid(display, xsmcGetHostChunk(xsArg(0)));
}

void xs_display_get_width(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	xsmcSetInteger(xsResult, TAB5_WIDTH);
}

void xs_display_get_height(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsDisplayHooks);
	xsmcSetInteger(xsResult, TAB5_HEIGHT);
}

static int displayBegin(void *hostData, int x, int y, int width, int height, void **frameBuffer, int32_t *rowBytes, int flags)
{
	modDisplay display = hostData;
	(void)flags;
	if (display->didBegin)
		return -1;
	if ((x < 0) || (y < 0) || (width <= 0) || (height <= 0) || ((x + width) > TAB5_WIDTH) || ((y + height) > TAB5_HEIGHT))
		return -2;
	display->updateX = x;
	display->updateY = y;
	display->updateWidth = width;
	display->updateHeight = height;
	display->didBegin = 1;
	display->direct = !!frameBuffer;
	if (frameBuffer)
		*frameBuffer = display->frameBuffer;
	if (rowBytes)
		*rowBytes = TAB5_WIDTH * 2;
	return 0;
}

static int displaySend(void *hostData, void *buffer, uint32_t length)
{
	modDisplay display = hostData;
	uint32_t rowBytes;
	uint32_t rows;
	if (!display->didBegin)
		return -1;
	rowBytes = display->updateWidth * 2;
	if (!length || (length % rowBytes))
		return -2;
	rows = length / rowBytes;
	if (rows > display->updateHeight)
		return -3;
	if (ESP_OK != esp_lcd_panel_draw_bitmap(display->panel, display->updateX, display->updateY,
		display->updateX + display->updateWidth, display->updateY + rows, buffer))
		return -4;
	display->updateY += rows;
	display->updateHeight -= rows;
	return 0;
}

static int displayEnd(void *hostData)
{
	modDisplay display = hostData;
	if (!display->didBegin)
		return -1;
	display->didBegin = 0;
	if (display->direct) {
		display->direct = 0;
		return (ESP_OK == esp_lcd_panel_draw_bitmap(display->panel,
			display->updateX, display->updateY,
			display->updateX + display->updateWidth,
			display->updateY + display->updateHeight,
			display->frameBuffer)) ? 0 : -2;
	}
	return display->updateHeight ? -2 : 0;
}

static void displayAdaptInvalid(void *hostData, CommodettoRectangle r)
{
	(void)hostData;
	(void)r;
}

static int displayGet(void *hostData, int32_t what, void *result)
{
	modDisplay display = hostData;
	if (1 != what)
		return -1;
	*(uint8_t *)result = !!display->frameBuffer;
	return 0;
}
