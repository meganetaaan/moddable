/*
 * Copyright (c) 2024-2025 Moddable Tech, Inc.
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

#include "mc.defines.h"
#if MODDEF_AUDIO_DUPLEX
#include "audioDuplex.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include <string.h>

static SemaphoreHandle_t mutex;
static i2s_chan_handle_t rx, tx;
static bool owned[2], active[2], rxEnabled, txEnabled;

/* RX owns the shared clock until the last active direction stops. Its DMA
 * may run without an Input object, but no recording task or callback exists. */
static esp_err_t synchronize(void)
{
    esp_err_t err;
    bool needRX = active[0] || active[1];
    if (needRX && !rxEnabled) {
        if ((err = i2s_channel_enable(rx)) != ESP_OK) return err;
        rxEnabled = true;
    }
    if (active[1] != txEnabled) {
        err = active[1] ? i2s_channel_enable(tx) : i2s_channel_disable(tx);
        if (err != ESP_OK) return err;
        txEnabled = active[1];
    }
    if (!needRX && rxEnabled) {
        if ((err = i2s_channel_disable(rx)) != ESP_OK) return err;
        rxEnabled = false;
    }
    return ESP_OK;
}

static void destroy(void)
{
    if (txEnabled) i2s_channel_disable(tx);
    if (rxEnabled) i2s_channel_disable(rx);
    if (tx) i2s_del_channel(tx);
    if (rx) i2s_del_channel(rx);
    rx = tx = NULL;
    rxEnabled = txEnabled = false;
}

static i2s_std_config_t configuration(unsigned rate)
{
    i2s_std_config_t config = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(rate),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
        .gpio_cfg = {
            .mclk = MODDEF_AUDIOIN_I2S_MCK_PIN,
            .bclk = MODDEF_AUDIOIN_I2S_BCK_PIN,
            .ws = MODDEF_AUDIOIN_I2S_LR_PIN,
            .dout = I2S_GPIO_UNUSED,
            .din = MODDEF_AUDIOIN_I2S_DATAIN,
        },
    };
    config.slot_cfg.slot_mask = I2S_STD_SLOT_BOTH;
    return config;
}

static esp_err_t createTX(unsigned rate)
{
    i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(MODDEF_AUDIOIN_I2S_NUM, I2S_ROLE_SLAVE);
    channel.dma_desc_num = 6;
    channel.dma_frame_num = 4092 / 2;
    channel.auto_clear = true;
    esp_err_t err = i2s_new_channel(&channel, &tx, NULL);
    if (err != ESP_OK) return err;
    i2s_std_config_t config = configuration(rate);
    config.gpio_cfg.din = I2S_GPIO_UNUSED;
    config.gpio_cfg.dout = MODDEF_AUDIOOUT_I2S_DATAOUT_PIN;
    config.gpio_cfg.mclk = I2S_GPIO_UNUSED;
    config.slot_cfg.slot_mode = I2S_SLOT_MODE_MONO;
    config.slot_cfg.slot_mask = MODDEF_AUDIOOUT_I2S_SLOT;
    err = i2s_channel_init_std_mode(tx, &config);
    if (err != ESP_OK) { i2s_del_channel(tx); tx = NULL; }
    return err;
}

static esp_err_t create(unsigned rate)
{
    i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(MODDEF_AUDIOIN_I2S_NUM, I2S_ROLE_MASTER);
    channel.dma_desc_num = 6;
    channel.dma_frame_num = 240;
    esp_err_t err = i2s_new_channel(&channel, NULL, &rx);
    if (err != ESP_OK) return err;
    /* AudioIn extracts the low 16 bits of each stereo frame. */
    i2s_std_config_t config = configuration(rate);
    err = i2s_channel_init_std_mode(rx, &config);
    if (err == ESP_OK) err = createTX(rate);
    if (err != ESP_OK) destroy();
    return err;
}

esp_err_t modAudioDuplexAcquire(bool input, unsigned rate, i2s_chan_handle_t *handle)
{
    unsigned index = input ? 0 : 1;
    esp_err_t err = ESP_OK;
    if (rate != MODDEF_AUDIOIN_SAMPLERATE) return ESP_ERR_INVALID_ARG;
    /* Acquisitions run on the XS thread; releases may run on the input task. */
    if (!mutex) mutex = xSemaphoreCreateMutex();
    if (!mutex) return ESP_ERR_NO_MEM;
    xSemaphoreTake(mutex, portMAX_DELAY);
    if (owned[index]) { err = ESP_ERR_INVALID_STATE; goto done; }
    if (!rx && (err = create(rate)) != ESP_OK) goto done;
    if (!input && !tx && (err = createTX(rate)) != ESP_OK) goto done;
    owned[index] = true;
    *handle = input ? rx : tx;
done:
    xSemaphoreGive(mutex);
    return err;
}

esp_err_t modAudioDuplexEnable(bool input)
{
    unsigned index = input ? 0 : 1;
    xSemaphoreTake(mutex, portMAX_DELAY);
    bool previous = active[index];
    if (input && rxEnabled && !previous) {
        uint8_t stale[960];
        size_t count;
        /* The peer may have kept RX clocks alive while this Input was stopped. */
        for (unsigned i = 0; i < 8; i++) {
            count = 0;
            i2s_channel_read(rx, stale, sizeof(stale), &count, 0);
            if (!count) break;
        }
    }
    active[index] = true;
    esp_err_t err = synchronize();
    if (err != ESP_OK) { active[index] = previous; synchronize(); }
    xSemaphoreGive(mutex);
    return err;
}

esp_err_t modAudioDuplexDisable(bool input)
{
    xSemaphoreTake(mutex, portMAX_DELAY);
    active[input ? 0 : 1] = false;
    esp_err_t err = synchronize();
    xSemaphoreGive(mutex);
    return err;
}

void modAudioDuplexRelease(bool input)
{
    unsigned index = input ? 0 : 1;
    xSemaphoreTake(mutex, portMAX_DELAY);
    active[index] = false;
    synchronize();
    if (!input && tx) {
        i2s_event_callbacks_t callbacks = {0};
        i2s_channel_register_event_callback(tx, &callbacks, NULL);
        /* A later Output must never inherit an earlier object's DMA audio. */
        i2s_del_channel(tx);
        tx = NULL;
    }
    owned[index] = false;
    if (!owned[0] && !owned[1]) destroy();
    xSemaphoreGive(mutex);
}
#endif
