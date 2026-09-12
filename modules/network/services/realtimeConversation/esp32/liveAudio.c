/*
 * Copyright (c) 2024-2026 Moddable Tech, Inc.
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

#include "esp_webrtc.h"
#include "liveAudio.h"
#include "driver/i2s_std.h"
#include "esp_heap_caps.h"
#ifndef CONFIG_IDF_TARGET_ESP32S3
#include "esp_aec.h"
#endif
#include "esp_ae_rate_cvt.h"
#include "audio_render.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/stream_buffer.h"
#include <stdlib.h>
#include <string.h>

/* The codec is configured by the Tab5 provider. This module owns BOTH I2S
 * directions for the entire session; do not open device.audio at the same time.
 * Three 10 ms DMA buffers separate a submitted sample from the capture clock.
 * AEC receives the software-volume-adjusted samples, including silence. */
#define BLOCK 480
#define DMA_BLOCKS 3
#define CAPTURE_BYTES 6400
#define PLAYBACK_BYTES 19200

struct LiveAudio {
	esp_capture_audio_src_if_t source;
	esp_capture_handle_t capture;
	av_render_handle_t player;
	audio_render_handle_t render;
	i2s_chan_handle_t tx, rx;
	StreamBufferHandle_t input, output;

#ifndef CONFIG_IDF_TARGET_ESP32S3
	aec_handle_t *aec;
#endif
	esp_ae_rate_cvt_handle_t resampler;
	atomic_bool stopping, done, reading, muted;
	atomic_uint volume, captured, rendered, underruns, overruns;
	atomic_uint micLevel, cleanLevel, referenceLevel;
	atomic_uint outputIdleMs, silenceMs, maxSilenceMs;
	atomic_int error;
	bool taskStarted, txEnabled, rxEnabled;
	uint32_t pts;
	int chunk;
	_Atomic(const char *) stage;
	int16_t *buffers;
};

static esp_capture_err_t sourceOpen(esp_capture_audio_src_if_t *s) { return ESP_CAPTURE_ERR_OK; }
static esp_capture_err_t sourceCodecs(esp_capture_audio_src_if_t *s, const esp_capture_format_id_t **codecs, uint8_t *count)
{
	static const esp_capture_format_id_t pcm = ESP_CAPTURE_FMT_ID_PCM;
	*codecs = &pcm; *count = 1;
	return ESP_CAPTURE_ERR_OK;
}
static esp_capture_err_t sourceNegotiate(esp_capture_audio_src_if_t *s, esp_capture_audio_info_t *in, esp_capture_audio_info_t *out)
{
	if (in->format_id != ESP_CAPTURE_FMT_ID_PCM) return ESP_CAPTURE_ERR_NOT_SUPPORTED;
	*out = (esp_capture_audio_info_t){.format_id = ESP_CAPTURE_FMT_ID_PCM, .sample_rate = 16000, .channel = 1, .bits_per_sample = 16};
	return ESP_CAPTURE_ERR_OK;
}
static esp_capture_err_t sourceStart(esp_capture_audio_src_if_t *s)
{
	LiveAudio *a = (LiveAudio *)s;
	a->pts = 0;
	atomic_store(&a->reading, true);
	return ESP_CAPTURE_ERR_OK;
}
static esp_capture_err_t sourceRead(esp_capture_audio_src_if_t *s, esp_capture_stream_frame_t *frame)
{
	LiveAudio *a = (LiveAudio *)s;
	int offset = 0;
	while (offset < frame->size && atomic_load(&a->reading) && !atomic_load(&a->stopping))
		offset += xStreamBufferReceive(a->input, frame->data + offset, frame->size - offset, pdMS_TO_TICKS(50));
	if (offset != frame->size) return ESP_CAPTURE_ERR_NOT_SUPPORTED;
	frame->pts = a->pts / 16;
	a->pts += frame->size / 2;
	return ESP_CAPTURE_ERR_OK;
}
static esp_capture_err_t sourceStop(esp_capture_audio_src_if_t *s)
{
	atomic_store(&((LiveAudio *)s)->reading, false);
	return ESP_CAPTURE_ERR_OK;
}
static audio_render_handle_t renderInit(void *cfg, int size) { return *(LiveAudio **)cfg; }
static int renderOpen(audio_render_handle_t h, av_render_audio_frame_info_t *info)
{
	return (info->sample_rate == 48000 && info->channel == 1 && info->bits_per_sample == 16) ? 0 : -1;
}
static int renderWrite(audio_render_handle_t h, av_render_audio_frame_t *frame)
{
	LiveAudio *a = h;
	int offset = 0;
	while (offset < frame->size && !atomic_load(&a->stopping))
		offset += xStreamBufferSend(a->output, frame->data + offset, frame->size - offset, pdMS_TO_TICKS(50));
	return offset == frame->size ? 0 : -1;
}
static int renderLatency(audio_render_handle_t h, uint32_t *ms)
{
	LiveAudio *a = h;
	*ms = xStreamBufferBytesAvailable(a->output) / 96 + DMA_BLOCKS * 10;
	return 0;
}
static int renderInfo(audio_render_handle_t h, av_render_audio_frame_info_t *info)
{
	*info = (av_render_audio_frame_info_t){.sample_rate = 48000, .channel = 1, .bits_per_sample = 16};
	return 0;
}
static int renderClose(audio_render_handle_t h) { return 0; }
static void renderDeinit(audio_render_handle_t h) {}

static void audioTask(void *ctx)
{
	LiveAudio *a = ctx;
	int16_t *tx = a->buffers, *rx = tx + BLOCK * 2;
	int16_t *pair = rx + BLOCK * 2, *converted = pair + BLOCK * 2;
	int16_t *reference = converted + BLOCK * 2;
	int16_t *mic = reference + BLOCK * DMA_BLOCKS;
	int16_t *ref = mic + a->chunk, *clean = ref + a->chunk;
	int accumulated = 0, delay = 0;
	unsigned idle = 1000, gap = 0;
	bool gapActive = false;
	while (!atomic_load(&a->stopping)) {
		/* Non-blocking dequeue: the clock must keep running between utterances. */
		size_t got = xStreamBufferReceive(a->output, tx, BLOCK * 2, 0);
		if (got < BLOCK * 2 && idle < 500) {
			if (!gapActive) atomic_fetch_add(&a->underruns, 1);
			gapActive = true; gap += 10;
			atomic_fetch_add(&a->silenceMs, 10);
			if (gap > atomic_load(&a->maxSilenceMs)) atomic_store(&a->maxSilenceMs, gap);
		} else { gapActive = false; gap = 0; }
		memset((uint8_t *)tx + got, 0, BLOCK * 2 - got);
		bool audible = false;
		for (size_t i = 0; i < got / 2; i++) if (abs(tx[i]) > 32) { audible = true; break; }
		/* Missing packets are not evidence of silence. Only received PCM
		 * can reopen the S3 microphone after playback. */
		if (audible) idle = 0;
		else if (got == BLOCK * 2 && idle < 10000) idle += 10;
		atomic_store(&a->outputIdleMs, idle);
		unsigned volume = atomic_load(&a->volume);
		for (int i = BLOCK - 1; i >= 0; i--) {
			int16_t sample = (int32_t)tx[i] * volume / 1024;
			tx[i * 2] = tx[i * 2 + 1] = sample;
		}
		size_t written = 0, received = 0;
		int err = i2s_channel_write(a->tx, tx, BLOCK * 4, &written, 200);
		if (!err) err = i2s_channel_read(a->rx, rx, BLOCK * 4, &received, 200);
		if (err || received != BLOCK * 4 || written != BLOCK * 4) {
			a->stage = written != BLOCK * 4 ? "i2s_write" : "i2s_read";
			atomic_store(&a->error, err ? err : ESP_ERR_INVALID_SIZE);
			break;
		}
		for (int i = 0; i < BLOCK; i++) {
			pair[i * 2] = rx[i * 2];
			pair[i * 2 + 1] = reference[delay];
			reference[delay] = tx[i * 2];
			delay = (delay + 1) % (BLOCK * DMA_BLOCKS);
		}
		uint32_t count = BLOCK;
		err = esp_ae_rate_cvt_process(a->resampler, pair, BLOCK, converted, &count);
		if (err) { atomic_store(&a->error, err); break; }
		atomic_fetch_add(&a->rendered, got / 2);
		for (uint32_t i = 0; i < count; i++) {
			mic[accumulated] = converted[i * 2];
			ref[accumulated++] = converted[i * 2 + 1];
			if (accumulated != a->chunk) continue;
#ifdef CONFIG_IDF_TARGET_ESP32S3
			memcpy(clean, mic, a->chunk * 2);
			// Gate capture locally before any JavaScript or server mute ACK can run.
			if (idle < 500) memset(clean, 0, a->chunk * 2);
#else
			aec_process(a->aec, mic, ref, clean);
#endif
			unsigned m = 0, r = 0, c = 0;
			for (int j = 0; j < a->chunk; j++) { m += abs(mic[j]); r += abs(ref[j]); c += abs(clean[j]); }
			atomic_store(&a->micLevel, m / a->chunk);
			atomic_store(&a->referenceLevel, r / a->chunk);
			atomic_store(&a->cleanLevel, c / a->chunk);
			if (atomic_load(&a->muted)) memset(clean, 0, a->chunk * 2);
			if (atomic_load(&a->reading)) {
				if (xStreamBufferSpacesAvailable(a->input) >= a->chunk * 2)
					xStreamBufferSend(a->input, clean, a->chunk * 2, 0);
				else atomic_fetch_add(&a->overruns, 1);
			}
			atomic_fetch_add(&a->captured, a->chunk);
			accumulated = 0;
		}
	}
	atomic_store(&a->done, true);
	vTaskDelete(NULL);
}

int liveAudioOpen(LiveAudio **out, esp_webrtc_media_provider_t *provider)
{
	LiveAudio *a = calloc(1, sizeof(*a));
	if (!a) return ESP_ERR_NO_MEM;
	*out = a;
	atomic_store(&a->volume, 512);
	a->source = (esp_capture_audio_src_if_t){.open = sourceOpen, .get_support_codecs = sourceCodecs,
		.negotiate_caps = sourceNegotiate, .start = sourceStart, .read_frame = sourceRead,
		.abort = sourceStop, .stop = sourceStop, .close = sourceStop};
	a->stage = "audio_buffers";
	a->input = xStreamBufferCreate(CAPTURE_BYTES, 1);
	a->output = xStreamBufferCreate(PLAYBACK_BYTES, 1);
	a->stage = "aec_create";
#ifdef CONFIG_IDF_TARGET_ESP32S3
	if (!a->input || !a->output) return ESP_ERR_NO_MEM;
	a->chunk = 160;
#else
	a->aec = aec_create(16000, 4, 1, AEC_MODE_FD_LOW_COST);
	if (!a->input || !a->output || !a->aec) return ESP_ERR_NO_MEM;
	a->chunk = aec_get_chunksize(a->aec);
#endif
	atomic_store(&a->outputIdleMs, 1000);
	a->buffers = heap_caps_aligned_calloc(16, BLOCK * (8 + DMA_BLOCKS) + a->chunk * 3, sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
	if (!a->buffers) return ESP_ERR_NO_MEM;
	esp_ae_rate_cvt_cfg_t rate = {.src_rate = 48000, .dest_rate = 16000, .channel = 2,
		.bits_per_sample = 16, .complexity = 2, .perf_type = ESP_AE_RATE_CVT_PERF_TYPE_SPEED};
	a->stage = "resampler_open";
	int err = esp_ae_rate_cvt_open(&rate, &a->resampler);
	if (err) return err;
	i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(
#ifdef CONFIG_IDF_TARGET_ESP32S3
		I2S_NUM_1,
#else
		I2S_NUM_0,
#endif
		I2S_ROLE_MASTER);
	channel.dma_desc_num = DMA_BLOCKS;
	channel.dma_frame_num = BLOCK;
	channel.auto_clear = true;
	a->stage = "i2s_new_channel";
	err = i2s_new_channel(&channel, &a->tx, &a->rx);
	if (err) return err;
	i2s_std_config_t config = {
		.clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(48000),
		.slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
		#ifdef CONFIG_IDF_TARGET_ESP32S3
		.gpio_cfg = {.mclk = 0, .bclk = 34, .ws = 33, .dout = 13, .din = 14}
#else
		.gpio_cfg = {.mclk = 30, .bclk = 27, .ws = 29, .dout = 26, .din = 28}
#endif
	};
	a->stage = "i2s_init_tx";
	if ((err = i2s_channel_init_std_mode(a->tx, &config))) return err;
	a->stage = "i2s_init_rx";
	if ((err = i2s_channel_init_std_mode(a->rx, &config))) return err;
	a->stage = "i2s_enable_rx";
	if ((err = i2s_channel_enable(a->rx))) return err;
	a->rxEnabled = true;
	a->stage = "i2s_enable_tx";
	if ((err = i2s_channel_enable(a->tx))) return err;
	a->txEnabled = true;
	a->stage = "audio_task";
	if (xTaskCreatePinnedToCore(audioTask, "live_audio", 8192, a, 20, NULL, 0) != pdPASS) return ESP_ERR_NO_MEM;
	a->taskStarted = true;
	esp_capture_cfg_t capture = {.sync_mode = ESP_CAPTURE_SYNC_MODE_AUDIO, .audio_src = &a->source};
	a->stage = "capture_open";
	if ((err = esp_capture_open(&capture, &a->capture))) return err;
	audio_render_cfg_t render = {.ops = {.init = renderInit, .open = renderOpen, .write = renderWrite,
		.get_latency = renderLatency, .get_frame_info = renderInfo, .close = renderClose, .deinit = renderDeinit},
		.cfg = &a, .cfg_size = sizeof(a)};
	a->stage = "render_alloc";
	a->render = audio_render_alloc_handle(&render);
	if (!a->render) return ESP_ERR_NO_MEM;
	av_render_cfg_t player = {.audio_render = a->render, .audio_raw_fifo_size = 16384, .audio_render_fifo_size = 32768};
	a->stage = "render_open";
	a->player = av_render_open(&player);
	if (!a->player) return ESP_ERR_NO_MEM;
	av_render_audio_frame_info_t info;
	renderInfo(a, &info);
	a->stage = "render_format";
	/* av_render 1.1.0 at c865084 assigns aud_fix_info but unconditionally
	 * returns WRONG_STATE. Accept that known return only for this setter. */
	err = av_render_set_fixed_frame_info(a->player, &info);
	if (err && err != ESP_MEDIA_ERR_WRONG_STATE) return err;
	provider->capture = a->capture;
	provider->player = a->player;
	return 0;
}
void liveAudioStop(LiveAudio *a)
{
	if (!a) return;
	atomic_store(&a->stopping, true);
	atomic_store(&a->reading, false);
}
void liveAudioClose(LiveAudio *a)
{
	if (!a) return;
	liveAudioStop(a);
	if (a->capture) esp_capture_close(a->capture);
	if (a->player) av_render_close(a->player);
	if (a->render) audio_render_free_handle(a->render);
	while (a->taskStarted && !atomic_load(&a->done)) vTaskDelay(pdMS_TO_TICKS(10));
	if (a->rxEnabled) i2s_channel_disable(a->rx);
	if (a->txEnabled) i2s_channel_disable(a->tx);
	if (a->rx) i2s_del_channel(a->rx);
	if (a->tx) i2s_del_channel(a->tx);
#ifndef CONFIG_IDF_TARGET_ESP32S3
	if (a->aec) aec_destroy(a->aec);
#endif
	if (a->resampler) esp_ae_rate_cvt_close(a->resampler);
	if (a->input) vStreamBufferDelete(a->input);
	if (a->output) vStreamBufferDelete(a->output);
	free(a->buffers);
	free(a);
}
void liveAudioMute(LiveAudio *a, bool mute) { if (a) atomic_store(&a->muted, mute); }
void liveAudioVolume(LiveAudio *a, unsigned volume) { if (a) atomic_store(&a->volume, volume); }
int liveAudioError(LiveAudio *a) { return a ? atomic_load(&a->error) : 0; }
const char *liveAudioStage(LiveAudio *a) { return a ? a->stage : "audio_allocate"; }
void liveAudioStats(LiveAudio *a, LiveAudioStats *s)
{
	if (!a) return;
	*s = (LiveAudioStats){atomic_load(&a->captured), atomic_load(&a->rendered), atomic_load(&a->underruns),
		atomic_load(&a->overruns), atomic_load(&a->micLevel), atomic_load(&a->cleanLevel), atomic_load(&a->referenceLevel), atomic_load(&a->outputIdleMs), atomic_load(&a->silenceMs), atomic_load(&a->maxSilenceMs)};
}
