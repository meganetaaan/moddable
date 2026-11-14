"""Compile the actual duplex manager against a deterministic I2S lifecycle fake."""
import pathlib, subprocess, tempfile
source = pathlib.Path(__file__).with_name("audioDuplex.c")
with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    (root / "driver").mkdir()
    (root / "freertos").mkdir()
    (root / "mc.defines.h").write_text("""
#define MODDEF_AUDIO_DUPLEX 1
#define MODDEF_AUDIOIN_I2S_NUM 0
#define MODDEF_AUDIOIN_SAMPLERATE 16000
#define MODDEF_AUDIOIN_I2S_MCK_PIN 18
#define MODDEF_AUDIOIN_I2S_BCK_PIN 17
#define MODDEF_AUDIOIN_I2S_LR_PIN 15
#define MODDEF_AUDIOIN_I2S_DATAIN 16
#define MODDEF_AUDIOOUT_I2S_DATAOUT_PIN 21
#define MODDEF_AUDIOIN_I2S_SLOT 1
#define MODDEF_AUDIOOUT_I2S_SLOT 1
""")
    (root / "driver/i2s_std.h").write_text("""
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <assert.h>
typedef int esp_err_t;
#define ESP_OK 0
#define ESP_ERR_INVALID_ARG 1
#define ESP_ERR_INVALID_STATE 2
#define ESP_ERR_NO_MEM 3
#define I2S_ROLE_MASTER 1
#define I2S_ROLE_SLAVE 2
#define I2S_GPIO_UNUSED -1
#define I2S_DATA_BIT_WIDTH_16BIT 16
#define I2S_SLOT_MODE_MONO 1
#define I2S_SLOT_MODE_STEREO 2
#define I2S_STD_SLOT_BOTH 3
#define I2S_CHANNEL_DEFAULT_CONFIG(id, role) {.role = role}
#undef I2S_CHANNEL_DEFAULT_CONFIG
#define I2S_CHANNEL_DEFAULT_CONFIG(i, r) {.role = r}
#define I2S_STD_CLK_DEFAULT_CONFIG(r) {.rate = r}
#define I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(b,m) {0}
typedef struct {int role, dma_desc_num, dma_frame_num; bool auto_clear;} i2s_chan_config_t;
typedef struct { struct {int rate;} clk_cfg; struct {int slot_mask, slot_mode;} slot_cfg; struct {int mclk,bclk,ws,dout,din;} gpio_cfg;} i2s_std_config_t;
typedef struct {bool running; int role;} *i2s_chan_handle_t;
typedef struct {int unused;} i2s_event_callbacks_t;
static int live, operations, failAt, drains;
static int maybeFail(void) {return ++operations == failAt ? 3 : 0;}
static int i2s_new_channel(const i2s_chan_config_t *c, i2s_chan_handle_t *t, i2s_chan_handle_t *r) {if(maybeFail())return 3; i2s_chan_handle_t h=calloc(1,sizeof(*h)); h->role=c->role; *(t?t:r)=h; live++;return 0;}
static int i2s_channel_init_std_mode(i2s_chan_handle_t h,const i2s_std_config_t *c) {return maybeFail();}
static int i2s_channel_enable(i2s_chan_handle_t h) {assert(h&&!h->running); h->running=true;return 0;}
static int i2s_channel_disable(i2s_chan_handle_t h) {assert(h&&h->running); h->running=false;return 0;}
static int i2s_del_channel(i2s_chan_handle_t h) {assert(h&&!h->running);free(h);live--;return 0;}
static int i2s_channel_register_event_callback(i2s_chan_handle_t h,const i2s_event_callbacks_t *c,void *ctx) {assert(!h->running);return 0;}
static int i2s_channel_read(i2s_chan_handle_t h,void *b,size_t n,size_t *got,int timeout) {assert(h->running);drains++;*got=0;return 0;}
""")
    (root / "freertos/FreeRTOS.h").write_text("#define portMAX_DELAY 0\n")
    (root / "freertos/semphr.h").write_text("""
typedef void *SemaphoreHandle_t;
static void *xSemaphoreCreateMutex(void) {return (void*)1;}
static void xSemaphoreTake(void *m,int n) {assert(m);}
static void xSemaphoreGive(void *m) {assert(m);}
""")
    (root / "test.c").write_text('#include "' + str(source) + '"\n' + """
int main(void) {
    i2s_chan_handle_t a,b;
    for(int failure=1;failure<=4;failure++) {
        operations=0;failAt=failure;
        assert(modAudioDuplexAcquire(true,16000,&a)!=0);
        assert(live==0);
    }
    failAt=0;
    assert(modAudioDuplexAcquire(true,8000,&a)!=0);
    for(int order=0;order<2;order++) {
        assert(modAudioDuplexAcquire(order,16000,&a)==0);
        assert(modAudioDuplexAcquire(order,16000,&b)!=0);
        assert(modAudioDuplexAcquire(!order,16000,&b)==0);
        assert(live==2);
        assert(modAudioDuplexEnable(false)==0);
        assert(rx->running&&tx->running);
        assert(modAudioDuplexEnable(true)==0);
        assert(drains>0);
        modAudioDuplexDisable(true);
        assert(rx->running&&tx->running);
        modAudioDuplexRelease(true);
        assert(live==2&&rx->running&&tx->running);
        assert(modAudioDuplexAcquire(true,16000,&a)==0);
        modAudioDuplexEnable(true);
        modAudioDuplexDisable(false);
        assert(rx->running&&!tx->running);
        modAudioDuplexRelease(false);
        assert(live==1&&rx->running);
        assert(modAudioDuplexAcquire(false,16000,&b)==0);
        modAudioDuplexEnable(false);
        modAudioDuplexRelease(false);
        assert(rx->running);
        modAudioDuplexRelease(true);
        assert(live==0);
    }
    return 0;
}
""")
    subprocess.run(["cc", "-std=c11", "-I", str(root), str(root / "test.c"), "-o", str(root / "test")], check=True)
    subprocess.run([str(root / "test")], check=True)
print("Duplex native lifecycle tests passed")
