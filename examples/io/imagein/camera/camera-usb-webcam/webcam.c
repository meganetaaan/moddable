/*
 * Copyright (c) 2024-2026  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

#include "xs.h"
#include "mc.defines.h"
#include "sdkconfig.h"

#include <string.h>
#include "driver/i2c_master.h"
#include "esp_camera.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "img_converters.h"
#include "usb_device_uvc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

extern i2c_master_bus_handle_t modI2CMasterBus(xsMachine *the, xsSlot *instance);

enum {
	kWidth = CONFIG_UVC_CAM1_FRAMESIZE_WIDTH,
	kHeight = CONFIG_UVC_CAM1_FRAMESIZE_HEIGT,
	kRate = CONFIG_UVC_CAM1_FRAMERATE,
	kJpegQuality = 70,
	kJpegCapacity = 48 * 1024,
};

typedef struct {
	uvc_fb_t frame;
	TaskHandle_t captureTask;
	SemaphoreHandle_t frameReady;
	size_t encodedSize;
	bool overflow;
} Webcam;

static const char *TAG = "cores3-webcam";
static Webcam webcam;

static size_t writeJpeg(void *context, size_t offset, const void *data, size_t size)
{
	Webcam *camera = context;
	if (camera->overflow || (offset > kJpegCapacity) || (size > kJpegCapacity - offset)) {
		camera->overflow = true;
		return 0;
	}
	if (size)
		memcpy(camera->frame.buf + offset, data, size);
	camera->encodedSize = offset + size;
	return size;
}

static void captureFrame(void *context)
{
	Webcam *camera = context;
	for (;;) {
		ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
		camera->frame.len = 0;
		camera->encodedSize = 0;
		camera->overflow = false;

		camera_fb_t *raw = esp_camera_fb_get();
		if (raw) {
			if ((raw->width == kWidth) && (raw->height == kHeight)
					&& (raw->format == PIXFORMAT_RGB565) && (raw->len == kWidth * kHeight * 2)
					&& frame2jpg_cb(raw, kJpegQuality, writeJpeg, camera) && !camera->overflow) {
				camera->frame.len = camera->encodedSize;
				camera->frame.timestamp = raw->timestamp;
			}
			esp_camera_fb_return(raw);
		}
		xSemaphoreGive(camera->frameReady);
	}
}

static esp_err_t startStream(uvc_format_t format, int width, int height, int rate, void *context)
{
	return ((format == UVC_FORMAT_JPEG) && (width == kWidth) && (height == kHeight) && (rate == kRate))
		? ESP_OK : ESP_ERR_NOT_SUPPORTED;
}

static uvc_fb_t *getFrame(void *context)
{
	Webcam *camera = context;
	xTaskNotifyGive(camera->captureTask);
	// UVC uses its own task notification for USB transfer completion.
	xSemaphoreTake(camera->frameReady, portMAX_DELAY);
	return camera->frame.len ? &camera->frame : NULL;
}

static void returnFrame(uvc_fb_t *frame, void *context)
{
	// UVC copies the JPEG into its transfer buffer before requesting another frame.
}

static void stopStream(void *context)
{
	// Keep the sensor initialized across UVC commits and USB reconnects.
}

static esp_err_t initWebcam(i2c_port_num_t port)
{
	camera_config_t config = {
		.pin_pwdn = MODDEF_CAMERA_POWERDOWN,
		.pin_reset = MODDEF_CAMERA_RESET,
		.pin_xclk = -1, // CoreS3 supplies the camera clock on the board.
		.pin_sccb_sda = -1, // Borrow the board's initialized I2C bus.
		.pin_sccb_scl = -1,
		.sccb_i2c_port = port,
		.pin_d0 = MODDEF_CAMERA_D0,
		.pin_d1 = MODDEF_CAMERA_D1,
		.pin_d2 = MODDEF_CAMERA_D2,
		.pin_d3 = MODDEF_CAMERA_D3,
		.pin_d4 = MODDEF_CAMERA_D4,
		.pin_d5 = MODDEF_CAMERA_D5,
		.pin_d6 = MODDEF_CAMERA_D6,
		.pin_d7 = MODDEF_CAMERA_D7,
		.pin_vsync = MODDEF_CAMERA_VSYNC,
		.pin_href = MODDEF_CAMERA_HREF,
		.pin_pclk = MODDEF_CAMERA_PCLK,
		.xclk_freq_hz = 20000000,
		.pixel_format = PIXFORMAT_RGB565,
		.frame_size = FRAMESIZE_QVGA,
		.fb_count = 1,
		.fb_location = CAMERA_FB_IN_PSRAM,
		.grab_mode = CAMERA_GRAB_WHEN_EMPTY,
	};

	esp_err_t result = esp_camera_init(&config);
	if (result != ESP_OK)
		return result;

	webcam.frame = (uvc_fb_t) {
		.buf = heap_caps_malloc(2 * kJpegCapacity, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT),
		.width = kWidth,
		.height = kHeight,
		.format = UVC_FORMAT_JPEG,
	};
	webcam.frameReady = xSemaphoreCreateBinary();
	result = ESP_ERR_NO_MEM;
	if (!webcam.frame.buf || !webcam.frameReady)
		goto fail;

	if (xTaskCreate(captureFrame, "webcam-capture", 8192, &webcam, 4, &webcam.captureTask) != pdPASS)
		goto fail;

	uvc_device_config_t uvcConfig = {
		.uvc_buffer = webcam.frame.buf + kJpegCapacity,
		.uvc_buffer_size = kJpegCapacity,
		.start_cb = startStream,
		.fb_get_cb = getFrame,
		.fb_return_cb = returnFrame,
		.stop_cb = stopStream,
		.cb_ctx = &webcam,
	};
	result = uvc_device_config(0, &uvcConfig);
	if (result == ESP_OK)
		result = uvc_device_init();
	if (result == ESP_OK)
		return ESP_OK;

fail:
	if (webcam.captureTask)
		vTaskDelete(webcam.captureTask);
	if (webcam.frameReady)
		vSemaphoreDelete(webcam.frameReady);
	heap_caps_free(webcam.frame.buf);
	memset(&webcam, 0, sizeof(webcam));
	esp_camera_deinit();
	return result;
}

void xs_cores3WebcamStart(xsMachine *the)
{
	if (webcam.captureTask)
		return;

	xsSlot cameraBus = xsArg(0);
	i2c_master_bus_handle_t bus = modI2CMasterBus(the, &cameraBus);
	for (i2c_port_num_t port = 0; port < I2C_NUM_MAX; port++) {
		i2c_master_bus_handle_t handle;
		if ((i2c_master_get_bus_handle(port, &handle) == ESP_OK) && (handle == bus)) {
			esp_err_t result = initWebcam(port);
			if (result != ESP_OK) {
				ESP_LOGE(TAG, "Webcam initialization failed: %s", esp_err_to_name(result));
				xsUnknownError("webcam initialization failed");
			}
			return;
		}
	}
	xsUnknownError("camera I2C bus unavailable");
}
