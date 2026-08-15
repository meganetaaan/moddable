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
#include "commodettoBitmapFormat.h"

#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>

#include "driver/i2c_master.h"
#include "driver/ppa.h"
#include "esp_heap_caps.h"
#include "esp_ipa.h"
#include "esp_video_device.h"
#include "esp_video_init.h"
#include "linux/videodev2.h"

#define kCameraFrameCount 3
#define kCameraBufferCount 4
#define kCameraWidth 1280
#define kCameraHeight 720

enum CameraFrameState {
	kCameraStateFree = 0,
	kCameraStateReady,
	kCameraStateClient,
};
typedef enum CameraFrameState CameraFrameState;

enum CameraState {
	kStateInitializing,
	kStateIdle,
	kStateRunning,
	kStateStopping,
	kStateClosing,
	kStateTerminated,
};

struct CameraFrameRecord {
	void *data;
	uint32_t dataLength;
	xsSlot *hostBuffer;
	uint32_t id;
	uint8_t index;
	CameraFrameState state;
};
typedef struct CameraFrameRecord CameraFrameRecord;
typedef struct CameraFrameRecord *CameraFrame;

struct CameraBufferRecord {
	void *data;
	void *rotatedData;
	uint32_t length;
};
typedef struct CameraBufferRecord CameraBufferRecord;

struct CameraRecord {
	xsMachine *the;
	xsSlot object;
	xsSlot *onReadable;
	xsSlot *hostBufferPrototype;

	SemaphoreHandle_t mutex;
	TaskHandle_t task;
	volatile uint8_t state;
	uint8_t calling;
	uint8_t didRead;
	uint8_t format;
	uint8_t swap16;
	uint8_t bufferCount;
	uint8_t streaming;
	uint8_t videoInitialized;
	uint16_t rotation;
	int fd;
	int initErr;
	int imageType;
	uint32_t width;
	uint32_t height;
	uint32_t captureWidth;
	uint32_t captureHeight;
	uint32_t frameLength;
	uint32_t frameID;
	ppa_client_handle_t ppa;
	ppa_srm_rotation_angle_t ppaRotation;

	CameraBufferRecord buffers[kCameraBufferCount];
	CameraFrameRecord frames[kCameraFrameCount];
};
typedef struct CameraRecord CameraRecord;
typedef struct CameraRecord *Camera;

static void cameraReleaseFrames(Camera camera, xsMachine *the);
static void cameraShutdown(Camera camera);
static void deliverCallbacks(void *the, void *refcon, uint8_t *message, uint16_t messageLength);
static void xs_camera_mark(xsMachine *the, void *it, xsMarkRoot markRoot);
void xs_camera_close(xsMachine *the);
void xs_camera_destructor(void *data);

static const xsHostHooks ICACHE_RODATA_ATTR xsCameraHooks = {
	xs_camera_destructor,
	xs_camera_mark,
	NULL
};

const esp_ipa_config_t *__real_esp_ipa_pipeline_get_config(const char *name);

/* The generic SC202CS LSC table overcorrects the Tab5 lens, adding magenta corners. */
const esp_ipa_config_t *__wrap_esp_ipa_pipeline_get_config(const char *name)
{
	static esp_ipa_config_t config;
	static esp_ipa_acc_config_t acc;
	const esp_ipa_config_t *source = __real_esp_ipa_pipeline_get_config(name);

	if (!source || !source->acc)
		return source;
	config = *source;
	acc = *source->acc;
	acc.lsc_table = C_NULL;
	acc.lsc_table_size = 0;
	config.acc = &acc;
	return &config;
}

static int cameraQueueBuffer(Camera camera, uint8_t index)
{
	struct v4l2_buffer buffer = {
		.type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
		.memory = V4L2_MEMORY_MMAP,
		.index = index,
	};

	return ioctl(camera->fd, VIDIOC_QBUF, &buffer);
}

static int cameraRotateBuffer(Camera camera, uint8_t index)
{
	CameraBufferRecord *buffer = &camera->buffers[index];
	ppa_srm_oper_config_t config = {
		.in = {
			.buffer = buffer->data,
			.pic_w = camera->captureWidth,
			.pic_h = camera->captureHeight,
			.block_w = camera->captureWidth,
			.block_h = camera->captureHeight,
			.srm_cm = PPA_SRM_COLOR_MODE_RGB565,
		},
		.out = {
			.buffer = buffer->rotatedData,
			.buffer_size = camera->frameLength,
			.pic_w = camera->width,
			.pic_h = camera->height,
			.srm_cm = PPA_SRM_COLOR_MODE_RGB565,
		},
		.rotation_angle = camera->ppaRotation,
		.scale_x = 1,
		.scale_y = 1,
		.mode = PPA_TRANS_MODE_BLOCKING,
	};

	return ppa_do_scale_rotate_mirror(camera->ppa, &config);
}

static int cameraInitialize(Camera camera)
{
	i2c_master_bus_handle_t i2c = C_NULL;
	esp_video_init_csi_config_t csi = {
		.sccb_config = {
			.init_sccb = true,
			.i2c_config = {
				.port = I2C_NUM_1,
				.scl_pin = GPIO_NUM_32,
				.sda_pin = GPIO_NUM_31,
			},
			.freq = 400000,
		},
		.reset_pin = -1,
		.pwdn_pin = -1,
	};
	esp_video_init_config_t config = {
		.csi = &csi,
	};
	struct v4l2_format format = {
		.type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
		.fmt.pix = {
			.width = kCameraWidth,
			.height = kCameraHeight,
			.pixelformat = V4L2_PIX_FMT_RGB565,
		},
	};
	struct v4l2_requestbuffers request = {
		.count = kCameraBufferCount,
		.type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
		.memory = V4L2_MEMORY_MMAP,
	};
	esp_err_t err;

	if (ESP_OK == i2c_master_get_bus_handle(I2C_NUM_1, &i2c)) {
		csi.sccb_config.init_sccb = false;
		csi.sccb_config.i2c_handle = i2c;
	}

	err = esp_video_init(&config);
	if (ESP_OK != err)
		return err;
	camera->videoInitialized = 1;

	camera->fd = open(ESP_VIDEO_MIPI_CSI_DEVICE_NAME, O_RDONLY);
	if (camera->fd < 0)
		return -errno;
	if (ioctl(camera->fd, VIDIOC_S_FMT, &format))
		return -errno;
	if (V4L2_PIX_FMT_RGB565 != format.fmt.pix.pixelformat)
		return -EINVAL;
	camera->captureWidth = format.fmt.pix.width;
	camera->captureHeight = format.fmt.pix.height;
	camera->frameLength = camera->captureWidth * camera->captureHeight * 2;
	if (format.fmt.pix.bytesperline && (format.fmt.pix.bytesperline != (camera->captureWidth * 2)))
		return -ENOTSUP;
	if ((90 == camera->rotation) || (270 == camera->rotation)) {
		camera->width = camera->captureHeight;
		camera->height = camera->captureWidth;
	}
	else {
		camera->width = camera->captureWidth;
		camera->height = camera->captureHeight;
	}
	if (camera->rotation) {
		ppa_client_config_t ppaConfig = {
			.oper_type = PPA_OPERATION_SRM,
			.max_pending_trans_num = 1,
		};
		err = ppa_register_client(&ppaConfig, &camera->ppa);
		if (ESP_OK != err)
			return err;
	}

	if (ioctl(camera->fd, VIDIOC_REQBUFS, &request))
		return -errno;
	if (request.count < 2)
		return -ENOMEM;
	camera->bufferCount = (request.count < kCameraBufferCount) ? request.count : kCameraBufferCount;

	for (uint8_t i = 0; i < camera->bufferCount; i++) {
		struct v4l2_buffer buffer = {
			.type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
			.memory = V4L2_MEMORY_MMAP,
			.index = i,
		};
		if (ioctl(camera->fd, VIDIOC_QUERYBUF, &buffer))
			return -errno;
		camera->buffers[i].length = buffer.length;
		camera->buffers[i].data = mmap(NULL, buffer.length, PROT_READ | PROT_WRITE,
			MAP_SHARED, camera->fd, buffer.m.offset);
		if (MAP_FAILED == camera->buffers[i].data) {
			camera->buffers[i].data = C_NULL;
			return -errno;
		}
		if (camera->rotation) {
			camera->buffers[i].rotatedData = heap_caps_aligned_calloc(4, camera->frameLength, 1,
				MALLOC_CAP_SPIRAM | MALLOC_CAP_DMA);
			if (!camera->buffers[i].rotatedData)
				return -ENOMEM;
		}
		if (cameraQueueBuffer(camera, i))
			return -errno;
	}

	int type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
	if (ioctl(camera->fd, VIDIOC_STREAMON, &type))
		return -errno;
	camera->streaming = 1;
	return 0;
}

static void cameraShutdown(Camera camera)
{
	if (camera->streaming) {
		int type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
		ioctl(camera->fd, VIDIOC_STREAMOFF, &type);
		camera->streaming = 0;
	}
	for (uint8_t i = 0; i < camera->bufferCount; i++) {
		if (camera->buffers[i].data) {
			munmap(camera->buffers[i].data, camera->buffers[i].length);
			camera->buffers[i].data = C_NULL;
		}
		if (camera->buffers[i].rotatedData) {
			heap_caps_free(camera->buffers[i].rotatedData);
			camera->buffers[i].rotatedData = C_NULL;
		}
	}
	if (camera->ppa) {
		ppa_unregister_client(camera->ppa);
		camera->ppa = C_NULL;
	}
	if (camera->fd >= 0) {
		close(camera->fd);
		camera->fd = -1;
	}
	if (camera->videoInitialized) {
		esp_video_deinit();
		camera->videoInitialized = 0;
	}
}

static void cameraLoop(void *refcon)
{
	Camera camera = refcon;
	uint8_t running = 0;

	camera->initErr = cameraInitialize(camera);
	if (camera->initErr)
		goto done;
	camera->state = kStateIdle;

	while (true) {
		uint32_t command = 0;
		TickType_t wait = running ? 0 : portMAX_DELAY;
		if (pdTRUE == xTaskNotifyWait(0, UINT32_MAX, &command, wait)) {
			if (kStateClosing == command)
				break;
			if (kStateStopping == command) {
				running = 0;
				camera->state = kStateIdle;
				continue;
			}
			if (kStateRunning == command) {
				running = 1;
				camera->state = kStateRunning;
			}
		}
		if (!running)
			continue;

		struct v4l2_buffer buffer = {
			.type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
			.memory = V4L2_MEMORY_MMAP,
		};
		if (ioctl(camera->fd, VIDIOC_DQBUF, &buffer)) {
			camera->initErr = -errno;
			break;
		}
		if ((buffer.index >= camera->bufferCount) || !(buffer.flags & V4L2_BUF_FLAG_DONE)) {
			cameraQueueBuffer(camera, buffer.index);
			continue;
		}

		if (buffer.bytesused != camera->frameLength) {
			camera->initErr = -EMSGSIZE;
			break;
		}
		void *data = camera->buffers[buffer.index].data;
		uint32_t length = buffer.bytesused;
		if (camera->rotation) {
			camera->initErr = cameraRotateBuffer(camera, buffer.index);
			if (camera->initErr)
				break;
			data = camera->buffers[buffer.index].rotatedData;
			length = camera->frameLength;
		}
		if (camera->swap16) {
			uint16_t *pixels = data;
			for (uint32_t i = 0; i < (length >> 1); i++)
				pixels[i] = __builtin_bswap16(pixels[i]);
		}

		CameraFrame frame = C_NULL;
		uint8_t post = 0;
		xSemaphoreTake(camera->mutex, portMAX_DELAY);
		if (kStateRunning == camera->state) {
			for (uint8_t i = 0; i < kCameraFrameCount; i++) {
				if (kCameraStateFree == camera->frames[i].state) {
					frame = &camera->frames[i];
					frame->data = data;
					frame->dataLength = length;
					frame->index = buffer.index;
					frame->id = ++camera->frameID;
					frame->state = kCameraStateReady;
					break;
				}
			}
			if (frame && camera->onReadable && !camera->calling) {
				camera->calling = 1;
				post = 1;
			}
		}
		xSemaphoreGive(camera->mutex);

		if (!frame)
			cameraQueueBuffer(camera, buffer.index);
		else if (post)
			modMessagePostToMachine(camera->the, C_NULL, 0, deliverCallbacks, camera);
	}

done:
	cameraShutdown(camera);
	camera->task = C_NULL;
	camera->state = kStateTerminated;
	vTaskDelete(NULL);
}

static void deliverCallbacks(void *the, void *refcon, uint8_t *message, uint16_t messageLength)
{
	Camera camera = refcon;
	uint8_t call, closing, post = 0;

	xSemaphoreTake(camera->mutex, portMAX_DELAY);
	call = (kStateRunning == camera->state);
	if (call)
		camera->didRead = 0;
	xSemaphoreGive(camera->mutex);

	if (call) {
		xsBeginHost(the);
			xsCallFunction1(xsReference(camera->onReadable), camera->object, xsInteger(0));
		xsEndHost(the);
	}

	xSemaphoreTake(camera->mutex, portMAX_DELAY);
	camera->calling = 0;
	closing = (kStateClosing == camera->state) || (kStateTerminated == camera->state);
	if (!closing && (kStateRunning == camera->state) && camera->didRead && camera->onReadable) {
		for (uint8_t i = 0; i < kCameraFrameCount; i++) {
			if (kCameraStateReady != camera->frames[i].state)
				continue;
			camera->calling = 1;
			post = 1;
			break;
		}
	}
	xSemaphoreGive(camera->mutex);
	if (post)
		modMessagePostToMachine(camera->the, C_NULL, 0, deliverCallbacks, camera);
	else if (closing)
		xs_camera_destructor(camera);
}

void xs_camera_constructor(xsMachine *the)
{
	uint8_t format;
	int imageType = kCommodettoBitmapRGB565LE;
	int rotation = 0;
	Camera camera;

	xsmcVars(1);
	format = builtinInitializeFormat(the, kIOFormatBuffer);
	if ((kIOFormatBuffer != format) && (kIOFormatBufferDisposable != format))
		xsRangeError("invalid format");
	if (xsmcGet(xsVar(0), xsArg(0), xsID_imageType)) {
		if (xsStringType == xsmcTypeOf(xsVar(0)))
			xsRangeError("unsupported imageType");
		imageType = xsmcToInteger(xsVar(0));
	}
	if ((kCommodettoBitmapRGB565LE != imageType) && (kCommodettoBitmapRGB565BE != imageType))
		xsRangeError("unsupported imageType");
	if (xsmcGet(xsVar(0), xsArg(0), xsID_rotation))
		rotation = xsmcToInteger(xsVar(0));
	if ((0 != rotation) && (90 != rotation) && (180 != rotation) && (270 != rotation))
		xsRangeError("invalid rotation");

	camera = c_calloc(1, sizeof(CameraRecord));
	if (!camera)
		xsUnknownError("not enough memory");
	camera->fd = -1;
	camera->mutex = xSemaphoreCreateMutex();
	if (!camera->mutex) {
		c_free(camera);
		xsUnknownError("not enough memory");
	}

	xsmcSetHostData(xsThis, camera);
	xsSetHostHooks(xsThis, (xsHostHooks *)&xsCameraHooks);
	camera->the = the;
	camera->object = xsThis;
	camera->format = format;
	camera->imageType = imageType;
	camera->rotation = rotation;
	switch (rotation) {
		case 90: camera->ppaRotation = PPA_SRM_ROTATION_ANGLE_270; break;
		case 180: camera->ppaRotation = PPA_SRM_ROTATION_ANGLE_180; break;
		case 270: camera->ppaRotation = PPA_SRM_ROTATION_ANGLE_90; break;
		default: camera->ppaRotation = PPA_SRM_ROTATION_ANGLE_0; break;
	}
	camera->swap16 = (kCommodettoBitmapRGB565BE == imageType);
	camera->onReadable = builtinGetCallback(the, xsID_onReadable);
	builtinInitializeTarget(the);
	xsmcGet(xsVar(0), xsArg(0), xsID_prototype);
	camera->hostBufferPrototype = xsmcToReference(xsVar(0));
	xsRemember(camera->object);

	camera->state = kStateInitializing;
	if (pdPASS != xTaskCreate(cameraLoop, "camera", 8 * 1024 + XT_STACK_EXTRA_CLIB,
		camera, 10, &camera->task)) {
		xs_camera_close(the);
		xsUnknownError("not enough memory");
	}
	while (kStateInitializing == camera->state)
		vTaskDelay(1);
	if (camera->initErr) {
		int err = camera->initErr;
		xs_camera_close(the);
		xsUnknownError("camera init failed %d", err);
	}
}

static void cameraReleaseFrames(Camera camera, xsMachine *the)
{
	for (uint8_t i = 0; i < kCameraFrameCount; i++) {
		CameraFrame frame = &camera->frames[i];
		if (frame->hostBuffer && the) {
			xsSlot buffer = xsReference(frame->hostBuffer);
			xsmcSetHostBuffer(buffer, C_NULL, 0);
		}
		if (frame->data)
			cameraQueueBuffer(camera, frame->index);
		frame->hostBuffer = C_NULL;
		frame->data = C_NULL;
		frame->state = kCameraStateFree;
	}
}

void xs_camera_destructor(void *data)
{
	Camera camera = data;
	if (!camera)
		return;
	if (camera->task) {
		camera->state = kStateClosing;
		xSemaphoreTake(camera->mutex, portMAX_DELAY);
		cameraReleaseFrames(camera, C_NULL);
		xSemaphoreGive(camera->mutex);
		xTaskNotify(camera->task, kStateClosing, eSetValueWithOverwrite);
		while (kStateTerminated != camera->state)
			modDelayMilliseconds(1);
	}
	vSemaphoreDelete(camera->mutex);
	c_free(camera);
}

void xs_camera_close(xsMachine *the)
{
	Camera camera = xsmcGetHostData(xsThis);
	if (!camera || !xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks))
		return;

	camera->state = kStateClosing;
	xSemaphoreTake(camera->mutex, portMAX_DELAY);
	cameraReleaseFrames(camera, the);
	xSemaphoreGive(camera->mutex);
	if (camera->task)
		xTaskNotify(camera->task, kStateClosing, eSetValueWithOverwrite);

	xsmcSetHostData(xsThis, C_NULL);
	xsmcSetHostDestructor(xsThis, C_NULL);
	xsForget(camera->object);
	if (!camera->calling)
		xs_camera_destructor(camera);
}

static void xs_camera_mark(xsMachine *the, void *it, xsMarkRoot markRoot)
{
	Camera camera = it;
	if (camera->onReadable)
		(*markRoot)(the, camera->onReadable);
	if (camera->hostBufferPrototype)
		(*markRoot)(the, camera->hostBufferPrototype);
	for (uint8_t i = 0; i < kCameraFrameCount; i++) {
		if (camera->frames[i].hostBuffer)
			(*markRoot)(the, camera->frames[i].hostBuffer);
	}
}

void xs_camera_read(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	CameraFrame frame = C_NULL;

	xSemaphoreTake(camera->mutex, portMAX_DELAY);
	for (uint8_t i = 0; i < kCameraFrameCount; i++) {
		if (kCameraStateReady != camera->frames[i].state)
			continue;
		if (!frame || (camera->frames[i].id < frame->id))
			frame = &camera->frames[i];
	}
	if (!frame) {
		xSemaphoreGive(camera->mutex);
		return;
	}

	if (kIOFormatBufferDisposable == camera->format) {
		xsSlot prototype = xsReference(camera->hostBufferPrototype);
		xsmcSetNewHostInstance(xsResult, prototype);
		xsmcSetHostBuffer(xsResult, frame->data, frame->dataLength);
		xsmcDefine(xsResult, xsID_camera, xsThis, xsDontDelete | xsDontSet);
		xsmcSetInteger(prototype, frame->dataLength);
		xsmcDefine(xsResult, xsID_byteLength, prototype, xsDontDelete | xsDontSet);
		xsmcPetrifyHostBuffer(xsResult);
		frame->hostBuffer = xsmcToReference(xsResult);
		frame->state = kCameraStateClient;
	}
	else {
		if ((xsmcArgc > 0) && (xsReferenceType == xsmcTypeOf(xsArg(0)))) {
			void *destination;
			xsUnsignedValue available;
			xsmcGetBufferWritable(xsArg(0), &destination, &available);
			if (available < frame->dataLength) {
				xSemaphoreGive(camera->mutex);
				xsRangeError("buffer too small");
			}
			c_memcpy(destination, frame->data, frame->dataLength);
			xsmcSetInteger(xsResult, frame->dataLength);
		}
		else
			xsmcSetArrayBuffer(xsResult, frame->data, frame->dataLength);
		cameraQueueBuffer(camera, frame->index);
		frame->data = C_NULL;
		frame->state = kCameraStateFree;
	}
	camera->didRead = 1;
	xSemaphoreGive(camera->mutex);
}

void xs_camera_start(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	if (!camera->task)
		xsUnknownError("camera unavailable");
	xTaskNotify(camera->task, kStateRunning, eSetValueWithOverwrite);
}

void xs_camera_stop(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	if (!camera->task)
		return;
	camera->state = kStateStopping;
	xSemaphoreTake(camera->mutex, portMAX_DELAY);
	cameraReleaseFrames(camera, the);
	xSemaphoreGive(camera->mutex);
	xTaskNotify(camera->task, kStateStopping, eSetValueWithOverwrite);
	while (kStateStopping == camera->state)
		modDelayMilliseconds(1);
}

void xs_camera_get_format(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	builtinGetFormat(the, camera->format);
}

void xs_camera_set_format(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	uint8_t format = builtinSetFormat(the);
	if ((kIOFormatBuffer != format) && (kIOFormatBufferDisposable != format))
		xsRangeError("invalid format");
	camera->format = format;
}

void xs_camera_get_imageType(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	xsmcSetInteger(xsResult, camera->imageType);
}

void xs_camera_get_width(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	xsmcSetInteger(xsResult, camera->width);
}

void xs_camera_get_height(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	xsmcSetInteger(xsResult, camera->height);
}

void xs_camera_get_identification(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	xsmcVars(1);
	xsmcSetNewObject(xsResult);
	xsmcSetStringX(xsVar(0), "SC202CS");
	xsmcSet(xsResult, xsID_model, xsVar(0));
}

void xs_camera_get_configuration(xsMachine *the)
{
	Camera camera = xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
	xsmcVars(1);
	xsmcSetNewObject(xsResult);
	xsmcSetInteger(xsVar(0), camera->rotation);
	xsmcSet(xsResult, xsID_rotation, xsVar(0));
}

void xs_camera_configure(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsCameraHooks);
}

void _xs_disposable_hostbuffer_destructor(void *data)
{
}

void _xs_disposable_hostbuffer_close(xsMachine *the)
{
	void *buffer = xsmcGetHostData(xsThis);
	if (!buffer)
		return;

	xsmcVars(1);
	xsmcGet(xsVar(0), xsThis, xsID_camera);
	Camera camera = xsmcGetHostDataValidate(xsVar(0), (void *)&xsCameraHooks);
	xSemaphoreTake(camera->mutex, portMAX_DELAY);
	for (uint8_t i = 0; i < kCameraFrameCount; i++) {
		CameraFrame frame = &camera->frames[i];
		if (frame->data == buffer) {
			cameraQueueBuffer(camera, frame->index);
			frame->state = kCameraStateFree;
			frame->data = C_NULL;
			frame->hostBuffer = C_NULL;
			xSemaphoreGive(camera->mutex);
			xsmcSetHostBuffer(xsThis, C_NULL, 0);
			return;
		}
	}
	xSemaphoreGive(camera->mutex);
	xsUnknownError("unknown buffer");
}
