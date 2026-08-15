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
#include "mc.xs.h"
#include "xsHost.h"

#include "builtinCommon.h"

#include <string.h>

#include "esp_intr_alloc.h"
#include "usb/hid_host.h"
#include "usb/usb_host.h"

#define kReportCount 8
#define kReportSize 64

enum {
	kStateInitializing,
	kStateRunning,
	kStateClosing,
	kStateTerminated,
};

typedef struct {
	uint8_t data[kReportSize];
	uint8_t length;
} USBHIDReportRecord;

typedef struct USBHIDRecord USBHIDRecord;
typedef USBHIDRecord *USBHID;

struct USBHIDRecord {
	xsMachine *the;
	xsSlot object;
	xsSlot *onReadable;
	xsSlot *onError;
	SemaphoreHandle_t mutex;
	TaskHandle_t task;
	hid_host_device_handle_t device;
	hid_host_device_handle_t pendingDevice;
	volatile uint8_t state;
	uint8_t protocol;
	uint8_t connected;
	uint8_t callbackPending;
	uint8_t didRead;
	uint8_t head;
	uint8_t count;
	uint8_t useCount;
	int error;
	USBHIDReportRecord reports[kReportCount];
};

static USBHID gUSBHID;

static void deliverCallbacks(void *the, void *refcon, uint8_t *message, uint16_t messageLength);
static void xs_usb_hid_mark(xsMachine *the, void *it, xsMarkRoot markRoot);
void xs_usb_hid_destructor(void *data);

static const xsHostHooks ICACHE_RODATA_ATTR xsUSBHIDHooks = {
	xs_usb_hid_destructor,
	xs_usb_hid_mark,
	C_NULL
};

static void usbHIDRelease(USBHID hid)
{
	if (0 != __atomic_sub_fetch(&hid->useCount, 1, __ATOMIC_SEQ_CST))
		return;
	vSemaphoreDelete(hid->mutex);
	c_free(hid);
}

static void usbHIDPost(USBHID hid, int error)
{
	uint8_t post = 0;

	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	if (error)
		hid->error = error;
	if ((kStateRunning == hid->state) && !hid->callbackPending &&
		(((hid->count > 0) && hid->onReadable) || (hid->error && hid->onError))) {
		hid->callbackPending = 1;
		__atomic_add_fetch(&hid->useCount, 1, __ATOMIC_SEQ_CST);
		post = 1;
	}
	xSemaphoreGive(hid->mutex);

	if (post && modMessagePostToMachine(hid->the, C_NULL, 0, deliverCallbacks, hid)) {
		xSemaphoreTake(hid->mutex, portMAX_DELAY);
		hid->callbackPending = 0;
		xSemaphoreGive(hid->mutex);
		usbHIDRelease(hid);
	}
}

static void usbHIDInterfaceCallback(hid_host_device_handle_t device,
	const hid_host_interface_event_t event, void *arg)
{
	USBHID hid = arg;

	if (HID_HOST_INTERFACE_EVENT_INPUT_REPORT == event) {
		uint8_t data[kReportSize];
		size_t length = 0;
		esp_err_t err = hid_host_device_get_raw_input_report_data(device, data, sizeof(data), &length);
		if (ESP_OK != err) {
			usbHIDPost(hid, err);
			return;
		}
		if (!length)
			return;

		xSemaphoreTake(hid->mutex, portMAX_DELAY);
		if (kStateRunning == hid->state) {
			if (kReportCount == hid->count) {
				hid->head = (hid->head + 1) % kReportCount;
				hid->count--;
				hid->error = ESP_ERR_NO_MEM;
			}
			USBHIDReportRecord *report = &hid->reports[(hid->head + hid->count) % kReportCount];
			c_memcpy(report->data, data, length);
			report->length = length;
			hid->count++;
		}
		xSemaphoreGive(hid->mutex);
		usbHIDPost(hid, 0);
	}
	else if (HID_HOST_INTERFACE_EVENT_DISCONNECTED == event) {
		hid_host_device_close(device);
		xSemaphoreTake(hid->mutex, portMAX_DELAY);
		if (hid->device == device) {
			hid->device = C_NULL;
			hid->connected = 0;
			hid->head = hid->count = 0;
		}
		xSemaphoreGive(hid->mutex);
	}
	else if (HID_HOST_INTERFACE_EVENT_TRANSFER_ERROR == event)
		usbHIDPost(hid, ESP_FAIL);
}

static void usbHIDDriverCallback(hid_host_device_handle_t device,
	const hid_host_driver_event_t event, void *arg)
{
	USBHID hid = arg;
	hid_host_dev_params_t params;

	if ((HID_HOST_DRIVER_EVENT_CONNECTED != event) ||
		(ESP_OK != hid_host_device_get_params(device, &params)))
		return;
	if ((HID_SUBCLASS_BOOT_INTERFACE != params.sub_class) || (hid->protocol != params.proto))
		return;

	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	if ((kStateRunning == hid->state) && !hid->device && !hid->pendingDevice)
		hid->pendingDevice = device;
	xSemaphoreGive(hid->mutex);
}

static esp_err_t usbHIDOpenPending(USBHID hid)
{
	hid_host_device_handle_t device;
	esp_err_t err;

	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	device = hid->pendingDevice;
	hid->pendingDevice = C_NULL;
	xSemaphoreGive(hid->mutex);
	if (!device)
		return ESP_OK;

	const hid_host_device_config_t config = {
		.callback = usbHIDInterfaceCallback,
		.callback_arg = hid,
	};
	err = hid_host_device_open(device, &config);
	if (ESP_OK == err)
		err = hid_class_request_set_protocol(device, HID_REPORT_PROTOCOL_BOOT);
	if ((ESP_OK == err) && (HID_PROTOCOL_KEYBOARD == hid->protocol))
		err = hid_class_request_set_idle(device, 0, 0);
	if (ESP_OK == err)
		err = hid_host_device_start(device);
	if (ESP_OK != err) {
		hid_host_device_close(device);
		return err;
	}

	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	hid->device = device;
	hid->connected = 1;
	xSemaphoreGive(hid->mutex);
	return ESP_OK;
}

static void usbHIDTask(void *refcon)
{
	USBHID hid = refcon;
	uint8_t hostInstalled = 0, driverInstalled = 0;
	esp_err_t err;
	const usb_host_config_t hostConfig = {
		.skip_phy_setup = false,
		.intr_flags = ESP_INTR_FLAG_LEVEL1,
	};
	const hid_host_driver_config_t driverConfig = {
		.create_background_task = true,
		.task_priority = 5,
		.stack_size = 4096,
		.core_id = tskNO_AFFINITY,
		.callback = usbHIDDriverCallback,
		.callback_arg = hid,
	};

	err = usb_host_install(&hostConfig);
	if (ESP_OK != err)
		goto done;
	hostInstalled = 1;
	err = hid_host_install(&driverConfig);
	if (ESP_OK != err)
		goto done;
	driverInstalled = 1;
	hid->state = kStateRunning;

	while (kStateRunning == hid->state) {
		uint32_t flags;
		usb_host_lib_handle_events(pdMS_TO_TICKS(5), &flags);
		err = usbHIDOpenPending(hid);
		if (ESP_OK != err)
			usbHIDPost(hid, err);
	}

done:
	if (driverInstalled && hostInstalled) {
		usb_host_lib_info_t info;
		uint32_t flags;
		usb_host_lib_set_root_port_power(false);
		while ((ESP_OK == usb_host_lib_info(&info)) && info.num_devices)
			usb_host_lib_handle_events(pdMS_TO_TICKS(20), &flags);
	}
	if (hid->device) {
		hid_host_device_stop(hid->device);
		hid_host_device_close(hid->device);
		hid->device = C_NULL;
	}
	if (driverInstalled && (ESP_OK == hid_host_uninstall())) {
		uint32_t flags = 0;
		while (!(flags & USB_HOST_LIB_EVENT_FLAGS_NO_CLIENTS))
			usb_host_lib_handle_events(portMAX_DELAY, &flags);
		if (ESP_ERR_NOT_FINISHED == usb_host_device_free_all()) {
			flags = 0;
			while (!(flags & USB_HOST_LIB_EVENT_FLAGS_ALL_FREE))
				usb_host_lib_handle_events(portMAX_DELAY, &flags);
		}
	}
	if (hostInstalled) {
		usb_host_uninstall();
	}
	if (kStateInitializing == hid->state)
		hid->error = err;
	hid->connected = 0;
	hid->state = kStateTerminated;
	hid->task = C_NULL;
	vTaskDelete(C_NULL);
}

static void deliverCallbacks(void *the, void *refcon, uint8_t *message, uint16_t messageLength)
{
	USBHID hid = refcon;
	uint8_t count = 0, post = 0;
	int error = 0;

	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	if (kStateRunning == hid->state) {
		count = hid->count;
		error = hid->error;
		hid->error = 0;
		hid->didRead = 0;
	}
	xSemaphoreGive(hid->mutex);

	if (error && hid->onError) {
		xsBeginHost(the);
		xsCallFunction1(xsReference(hid->onError), hid->object, xsInteger(error));
		xsEndHost(the);
	}
	if (count && hid->onReadable && (kStateRunning == hid->state)) {
		xsBeginHost(the);
		xsCallFunction1(xsReference(hid->onReadable), hid->object, xsInteger(count));
		xsEndHost(the);
	}

	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	hid->callbackPending = 0;
	if ((kStateRunning == hid->state) &&
		(((hid->didRead && hid->count) && hid->onReadable) || (hid->error && hid->onError))) {
		hid->callbackPending = 1;
		__atomic_add_fetch(&hid->useCount, 1, __ATOMIC_SEQ_CST);
		post = 1;
	}
	xSemaphoreGive(hid->mutex);
	if (post && modMessagePostToMachine(hid->the, C_NULL, 0, deliverCallbacks, hid)) {
		xSemaphoreTake(hid->mutex, portMAX_DELAY);
		hid->callbackPending = 0;
		xSemaphoreGive(hid->mutex);
		usbHIDRelease(hid);
	}
	usbHIDRelease(hid);
}

void xs_usb_hid_constructor(xsMachine *the)
{
	USBHID hid;
	uint8_t protocol = HID_PROTOCOL_MOUSE;

	xsmcVars(1);
	if (gUSBHID)
		xsUnknownError("in use");
	if (xsmcGet(xsVar(0), xsArg(0), xsID_protocol)) {
		char *value = xsmcToString(xsVar(0));
		if (!c_strcmp(value, "mouse"))
			protocol = HID_PROTOCOL_MOUSE;
		else if (!c_strcmp(value, "keyboard"))
			protocol = HID_PROTOCOL_KEYBOARD;
		else
			xsRangeError("invalid protocol");
	}
	if (kIOFormatBuffer != builtinInitializeFormat(the, kIOFormatBuffer))
		xsRangeError("invalid format");
	builtinInitializeTarget(the);

	hid = c_calloc(1, sizeof(USBHIDRecord));
	if (!hid)
		xsUnknownError("not enough memory");
	hid->mutex = xSemaphoreCreateMutex();
	if (!hid->mutex) {
		c_free(hid);
		xsUnknownError("not enough memory");
	}
	hid->the = the;
	hid->object = xsThis;
	hid->onReadable = builtinGetCallback(the, xsID_onReadable);
	hid->onError = builtinGetCallback(the, xsID_onError);
	hid->protocol = protocol;
	hid->state = kStateInitializing;
	hid->useCount = 1;
	gUSBHID = hid;
	xsmcSetHostData(xsThis, hid);
	xsSetHostHooks(xsThis, (xsHostHooks *)&xsUSBHIDHooks);

	if (pdPASS != xTaskCreate(usbHIDTask, "usb-hid", 6144 + XT_STACK_EXTRA_CLIB,
		hid, 5, &hid->task)) {
		hid->state = kStateTerminated;
		hid->error = ESP_ERR_NO_MEM;
	}
	while (kStateInitializing == hid->state)
		vTaskDelay(1);
	if (kStateRunning != hid->state) {
		int error = hid->error;
		gUSBHID = C_NULL;
		xsmcSetHostData(xsThis, C_NULL);
		xsmcSetHostDestructor(xsThis, C_NULL);
		usbHIDRelease(hid);
		xsUnknownError("USB HID init failed %d", error);
	}
	xsRemember(hid->object);
}

void xs_usb_hid_destructor(void *data)
{
	USBHID hid = data;
	if (!hid)
		return;
	if (hid->task) {
		hid->state = kStateClosing;
		usb_host_lib_unblock();
		while (kStateTerminated != hid->state)
			modDelayMilliseconds(1);
	}
	if (gUSBHID == hid)
		gUSBHID = C_NULL;
	usbHIDRelease(hid);
}

void xs_usb_hid_close(xsMachine *the)
{
	USBHID hid = xsmcGetHostData(xsThis);
	if (!hid || !xsmcGetHostDataValidate(xsThis, (void *)&xsUSBHIDHooks))
		return;
	hid->state = kStateClosing;
	xsForget(hid->object);
	xsmcSetHostData(xsThis, C_NULL);
	xsmcSetHostDestructor(xsThis, C_NULL);
	xs_usb_hid_destructor(hid);
}

static void xs_usb_hid_mark(xsMachine *the, void *it, xsMarkRoot markRoot)
{
	USBHID hid = it;
	if (hid->onReadable)
		(*markRoot)(the, hid->onReadable);
	if (hid->onError)
		(*markRoot)(the, hid->onError);
}

void xs_usb_hid_read(xsMachine *the)
{
	USBHID hid = xsmcGetHostDataValidate(xsThis, (void *)&xsUSBHIDHooks);
	uint8_t data[kReportSize], length;
	void *buffer = C_NULL;
	xsUnsignedValue available = 0;
	uint8_t supplied = (xsmcArgc && (xsUndefinedType != xsmcTypeOf(xsArg(0))));

	if (supplied)
		xsmcGetBufferWritable(xsArg(0), &buffer, &available);
	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	if (!hid->count) {
		xSemaphoreGive(hid->mutex);
		return;
	}
	USBHIDReportRecord *report = &hid->reports[hid->head];
	length = report->length;
	if (supplied && (available < length)) {
		xSemaphoreGive(hid->mutex);
		xsRangeError("buffer too small");
	}
	c_memcpy(data, report->data, length);
	hid->head = (hid->head + 1) % kReportCount;
	hid->count--;
	hid->didRead = 1;
	xSemaphoreGive(hid->mutex);

	if (supplied) {
		c_memcpy(buffer, data, length);
		xsmcSetInteger(xsResult, length);
	}
	else {
		buffer = xsmcSetArrayBuffer(xsResult, C_NULL, length);
		c_memcpy(buffer, data, length);
	}
}

void xs_usb_hid_get_connected(xsMachine *the)
{
	USBHID hid = xsmcGetHostDataValidate(xsThis, (void *)&xsUSBHIDHooks);
	xSemaphoreTake(hid->mutex, portMAX_DELAY);
	xsmcSetBoolean(xsResult, hid->connected);
	xSemaphoreGive(hid->mutex);
}

void xs_usb_hid_get_format(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsUSBHIDHooks);
	builtinGetFormat(the, kIOFormatBuffer);
}

void xs_usb_hid_set_format(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsUSBHIDHooks);
	if (kIOFormatBuffer != builtinSetFormat(the))
		xsRangeError("invalid format");
}

void xs_usb_hid_get_protocol(xsMachine *the)
{
	USBHID hid = xsmcGetHostDataValidate(xsThis, (void *)&xsUSBHIDHooks);
	xsmcSetString(xsResult, (HID_PROTOCOL_MOUSE == hid->protocol) ? "mouse" : "keyboard");
}
