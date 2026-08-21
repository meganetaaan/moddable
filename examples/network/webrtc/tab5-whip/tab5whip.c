/*
 * Copyright (c) 2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of the license, visit
 *       <http://creativecommons.org/licenses/by/4.0>
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

#include "xsmc.h"
#include "xsHost.h"
#include "builtinCommon.h"

#include <stdbool.h>
#include <string.h>

#include "driver/i2c_master.h"
#include "esp_capture.h"
#include "impl/esp_capture_video_v4l2_src.h"
#include "esp_h264_enc_single_hw.h"
#include "esp_h264_types.h"
#include "esp_ipa.h"
#include "esp_log.h"
#include "esp_peer_whip_signaling.h"
#include "esp_video_codec_types.h"
#include "encoder/esp_video_enc_default.h"
#include "esp_video_init.h"
#include "esp_webrtc.h"
#include "esp_webrtc_defaults.h"
#include "media_lib_adapter.h"
#include "media_lib_os.h"

#define kVideoWidth 1280
#define kVideoHeight 720
#define kVideoFPS 30

typedef struct Tab5WHIPRecord Tab5WHIPRecord;
struct Tab5WHIPRecord {
	char *url;
	char *token;
	esp_capture_handle_t capture;
	esp_webrtc_handle_t webrtc;
	volatile int status;
	volatile int error;
	bool starting;
};

static const char *kTag = "TAB5_WHIP";
static Tab5WHIPRecord *gWHIP;

enum {
	kWHIPStopped,
	kWHIPStarting,
	kWHIPSignaling,
	kWHIPConnected,
	kWHIPFailed,
	kWHIPDisconnected,
};

/* Keep the Tab5 camera tuning used by the Moddable camera module. */
const esp_ipa_config_t *__real_esp_ipa_pipeline_get_config(const char *name);

const esp_ipa_config_t *__wrap_esp_ipa_pipeline_get_config(const char *name)
{
	static esp_ipa_config_t config;
	static esp_ipa_acc_config_t acc;
	const esp_ipa_config_t *source = __real_esp_ipa_pipeline_get_config(name);
	if (!source || !source->acc)
		return source;
	config = *source;
	acc = *source->acc;
	acc.lsc_table = NULL;
	acc.lsc_table_size = 0;
	config.acc = &acc;
	return &config;
}

esp_h264_err_t __real_esp_h264_enc_hw_new(const esp_h264_enc_cfg_hw_t *cfg, esp_h264_enc_handle_t *out_enc);

esp_h264_err_t __wrap_esp_h264_enc_hw_new(const esp_h264_enc_cfg_hw_t *cfg, esp_h264_enc_handle_t *out_enc)
{
	if (!cfg || ((int)cfg->pic_type != (int)ESP_VIDEO_CODEC_PIXEL_FMT_O_UYY_E_VYY))
		return __real_esp_h264_enc_hw_new(cfg, out_enc);
	esp_h264_enc_cfg_hw_t fixed = *cfg;
	fixed.pic_type = (esp_h264_raw_format_t)ESP_H264_RAW_FMT_O_UYY_E_VYY;
	return __real_esp_h264_enc_hw_new(&fixed, out_enc);
}

static void threadScheduler(const char *name, media_lib_thread_cfg_t *config)
{
	if (0 == strcmp(name, "pc_task")) {
		config->stack_size = 25 * 1024;
		config->priority = 18;
		config->core_id = 1;
	}
	else if (0 == strcmp(name, "start"))
		config->stack_size = 6 * 1024;
}

static void captureScheduler(const char *name, esp_capture_thread_schedule_cfg_t *config)
{
	media_lib_thread_cfg_t thread = {
		.stack_size = config->stack_size,
		.priority = config->priority,
		.core_id = config->core_id,
	};
	config->stack_in_ext = true;
	threadScheduler(name, &thread);
	config->stack_size = thread.stack_size;
	config->priority = thread.priority;
	config->core_id = thread.core_id;
}

static int captureInit(Tab5WHIPRecord *whip)
{
	i2c_master_bus_handle_t i2c = NULL;
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
	if (ESP_OK == i2c_master_get_bus_handle(I2C_NUM_1, &i2c)) {
		csi.sccb_config.init_sccb = false;
		csi.sccb_config.i2c_handle = i2c;
	}
	esp_video_init_config_t video = {.csi = &csi};
	esp_err_t result = esp_video_init(&video);
	if (ESP_OK != result) {
		ESP_LOGE(kTag, "esp_video_init failed: %s", esp_err_to_name(result));
		return result;
	}

	esp_capture_video_v4l2_src_cfg_t sourceConfig = {
		.dev_name = "/dev/video0",
		.buf_count = 2,
	};
	esp_capture_video_src_if_t *source = esp_capture_new_video_v4l2_src(&sourceConfig);
	if (!source)
		return ESP_ERR_NO_MEM;
	esp_capture_cfg_t captureConfig = {
		.sync_mode = ESP_CAPTURE_SYNC_MODE_NONE,
		.video_src = source,
	};
	return esp_capture_open(&captureConfig, &whip->capture);
}

static int webrtcEventHandler(esp_webrtc_event_t *event, void *ctx);

static int startWebRTC(Tab5WHIPRecord *whip)
{
	if (whip != gWHIP || whip->webrtc || !whip->url[0])
		return 0;
	if (!whip->capture) {
		int result = captureInit(whip);
		if (result)
			return result;
	}

	esp_peer_signaling_whip_cfg_t whipConfig = {
		.auth_type = ESP_PEER_SIGNALING_WHIP_AUTH_TYPE_BASIC,
		.token = whip->token,
	};
	esp_webrtc_cfg_t config = {
		.peer_cfg = {
			.audio_info = {.codec = ESP_PEER_AUDIO_CODEC_G711A},
			.video_info = {
				.codec = ESP_PEER_VIDEO_CODEC_H264,
				.width = kVideoWidth,
				.height = kVideoHeight,
				.fps = kVideoFPS,
			},
			.audio_dir = ESP_PEER_MEDIA_DIR_SEND_ONLY,
			.video_dir = ESP_PEER_MEDIA_DIR_SEND_ONLY,
			.no_auto_reconnect = true,
		},
		.signaling_cfg = {
			.signal_url = whip->url,
			.extra_cfg = whip->token[0] ? &whipConfig : NULL,
			.extra_size = whip->token[0] ? sizeof(whipConfig) : 0,
		},
		.peer_impl = esp_peer_get_default_impl(),
		.signaling_impl = esp_signaling_get_whip_impl(),
	};
	esp_webrtc_media_provider_t provider = {.capture = whip->capture};
	esp_webrtc_handle_t handle = NULL;
	int result = esp_webrtc_open(&config, &handle);
	if (!result)
		result = esp_webrtc_set_media_provider(handle, &provider);
	if (!result)
		result = esp_webrtc_set_event_handler(handle, webrtcEventHandler, whip);
	if (!result)
		result = esp_webrtc_enable_peer_connection(handle, true);
	if (!result) {
		whip->webrtc = handle;
		whip->status = kWHIPSignaling;
		result = esp_webrtc_start(handle);
	}
	if (result) {
		ESP_LOGE(kTag, "WHIP start failed: %d", result);
		if (handle) {
			whip->webrtc = NULL;
			esp_webrtc_close(handle);
		}
		whip->status = kWHIPFailed;
		whip->error = result;
		return result;
	}
	ESP_LOGI(kTag, "publishing H.264 to %s", whip->url);
	return 0;
}

static int webrtcEventHandler(esp_webrtc_event_t *event, void *ctx)
{
	Tab5WHIPRecord *whip = ctx;
	if (!event || whip != gWHIP || (whip->status == kWHIPStopped))
		return 0;
	switch (event->type) {
		case ESP_WEBRTC_EVENT_CONNECTED:
			whip->status = kWHIPConnected;
			whip->error = 0;
			break;
		case ESP_WEBRTC_EVENT_CONNECT_FAILED:
			whip->status = kWHIPFailed;
			whip->error = -1;
			break;
		case ESP_WEBRTC_EVENT_DISCONNECTED:
			whip->status = kWHIPDisconnected;
			break;
	}
	return 0;
}

static void startTask(void *arg)
{
	Tab5WHIPRecord *whip = arg;
	if (whip == gWHIP)
		(void)startWebRTC(whip);
	if (whip == gWHIP)
		whip->starting = false;
	media_lib_thread_destroy(NULL);
}

void xs_tab5_whip_constructor(xsMachine *the)
{
	if (gWHIP)
		xsUnknownError("only one Tab5 WHIP instance is supported");
	Tab5WHIPRecord *whip = c_calloc(1, sizeof(Tab5WHIPRecord));
	if (!whip)
		xsUnknownError("no memory");
	const char *url = xsmcToString(xsArg(0));
	const char *token = xsmcToString(xsArg(1));
	whip->url = strdup(url);
	whip->token = strdup(token);
	if (!whip->url || !whip->token) {
		c_free(whip->url);
		c_free(whip->token);
		c_free(whip);
		xsUnknownError("no memory");
	}
	whip->status = kWHIPStopped;
	xsmcSetHostData(xsThis, whip);
	gWHIP = whip;
}

void xs_tab5_whip_destructor(void *data)
{
	Tab5WHIPRecord *whip = data;
	if (!whip)
		return;
	if (gWHIP == whip) {
		gWHIP = NULL;
		whip->status = kWHIPStopped;
		if (whip->webrtc)
			esp_webrtc_close(whip->webrtc);
		if (whip->capture)
			esp_capture_close(whip->capture);
	}
	c_free(whip->url);
	c_free(whip->token);
	c_free(whip);
}

void xs_tab5_whip_start(xsMachine *the)
{
	Tab5WHIPRecord *whip = xsmcGetHostData(xsThis);
	if (!whip->starting && !whip->webrtc) {
		media_lib_add_default_adapter();
		esp_capture_set_thread_scheduler(captureScheduler);
		media_lib_thread_set_schedule_cb(threadScheduler);
		esp_video_enc_register_default();
		whip->status = kWHIPStarting;
		whip->error = 0;
		whip->starting = true;
		if (media_lib_thread_create_from_scheduler(NULL, "start", startTask, whip) != ESP_MEDIA_ERR_OK) {
			whip->starting = false;
			whip->status = kWHIPFailed;
			whip->error = -1;
		}
	}
	xsmcSetInteger(xsResult, 0);
}

void xs_tab5_whip_stop(xsMachine *the)
{
	Tab5WHIPRecord *whip = xsmcGetHostData(xsThis);
	whip->status = kWHIPStopped;
	if (whip->webrtc) {
		esp_webrtc_handle_t handle = whip->webrtc;
		whip->webrtc = NULL;
		esp_webrtc_close(handle);
	}
	xsmcSetInteger(xsResult, 0);
}

void xs_tab5_whip_query(xsMachine *the)
{
	Tab5WHIPRecord *whip = xsmcGetHostData(xsThis);
	if (whip->webrtc)
		esp_webrtc_query(whip->webrtc);
	xsmcSetInteger(xsResult, 0);
}

void xs_tab5_whip_status_get(xsMachine *the)
{
	Tab5WHIPRecord *whip = xsmcGetHostData(xsThis);
	xsmcSetInteger(xsResult, whip->status);
}

void xs_tab5_whip_error_get(xsMachine *the)
{
	Tab5WHIPRecord *whip = xsmcGetHostData(xsThis);
	xsmcSetInteger(xsResult, whip->error);
}
