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
#include "mc.defines.h"
#include "builtinCommon.h"

#include <emscripten.h>

typedef struct AudioOutputRecord AudioOutputRecord;
typedef struct AudioOutputRecord *AudioOutput;

struct AudioOutputRecord {
	xsMachine *the;
	xsSlot object;
	xsSlot *onWritable;
	uint8_t bitsPerSample;
	uint8_t numChannels;
	uint32_t sampleRate;
	uint16_t bytesPerFrame;
	double volume;
	uint8_t running;
	uint8_t calling;
	uint8_t callbackPending;
	uint32_t pendingBytes;
	uint32_t id;
	AudioOutput next;
};

static void xs_audioout_mark_(xsMachine* the, void* it, xsMarkRoot markRoot);

static const xsHostHooks xsAudioOutputHooks = {
	xs_audioout_destructor_,
	xs_audioout_mark_,
	NULL
};

static AudioOutput gAudioOutputs = NULL;

static AudioOutput audiooutFind(uint32_t id)
{
	AudioOutput output = gAudioOutputs;
	while (output) {
		if (output->id == id)
			return output;
		output = output->next;
	}
	return NULL;
}

static void audiooutAdd(AudioOutput output)
{
	output->next = gAudioOutputs;
	gAudioOutputs = output;
}

static void audiooutRemove(AudioOutput output)
{
	AudioOutput *walker = &gAudioOutputs;
	while (*walker) {
		if (*walker == output) {
			*walker = output->next;
			return;
		}
		walker = &((*walker)->next);
	}
}

EM_JS(uint32_t, wasmAudioOutCreate, (uint32_t bitsPerSample, uint32_t numChannels, uint32_t sampleRate, uint32_t bytesPerFrame, uint32_t queueLength, uint32_t bufferSize), {
	if (!globalThis.gxAudio)
		return 0;
	return globalThis.gxAudio.createOut(bitsPerSample, numChannels, sampleRate, bytesPerFrame, queueLength, bufferSize);
});

EM_JS(void, wasmAudioOutDestroy, (uint32_t id), {
	if (globalThis.gxAudio)
		globalThis.gxAudio.destroyOut(id);
});

EM_JS(void, wasmAudioOutStart, (uint32_t id), {
	if (globalThis.gxAudio)
		globalThis.gxAudio.startOut(id);
});

EM_JS(void, wasmAudioOutStop, (uint32_t id), {
	if (globalThis.gxAudio)
		globalThis.gxAudio.stopOut(id);
});

EM_JS(int, wasmAudioOutWrite, (uint32_t id, uint8_t *buffer, uint32_t length), {
	if (!globalThis.gxAudio)
		return -1;
	return globalThis.gxAudio.writeOut(id, buffer, length);
});

EM_JS(uint32_t, wasmAudioOutAvailable, (uint32_t id), {
	if (!globalThis.gxAudio)
		return 0;
	return globalThis.gxAudio.availableOut(id);
});

EM_JS(void, wasmAudioOutSetVolume, (uint32_t id, double volume), {
	if (globalThis.gxAudio)
		globalThis.gxAudio.setOutVolume(id, volume);
});

static void audiooutDeliver(void *it)
{
	AudioOutput output = it;
	uint32_t bytes;

	if (!output || !output->callbackPending)
		return;

	bytes = output->pendingBytes;
	output->pendingBytes = 0;
	output->callbackPending = 0;

	if (!output->onWritable || !output->running)
		return;

	output->calling = 1;
	xsBeginHost(output->the);
	xsResult = xsAccess(output->object);
	xsCallFunction2(xsReference(output->onWritable), xsResult, xsInteger(bytes), xsInteger(bytes / output->bytesPerFrame));
	xsEndHost(output->the);
	if (output->calling)
		output->calling = 0;
	else
		xs_audioout_destructor_(output);
}

EMSCRIPTEN_KEEPALIVE void modAudioOutWritable(uint32_t id, uint32_t bytes)
{
	AudioOutput output = audiooutFind(id);
	if (!output || output->callbackPending || !output->running)
		return;
	if (!output->onWritable || (0 == bytes))
		return;
	output->callbackPending = 1;
	output->pendingBytes = bytes;
	emscripten_async_call(audiooutDeliver, output, 0);
}

EMSCRIPTEN_KEEPALIVE void modAudioOutSetSampleRate(uint32_t id, uint32_t sampleRate)
{
	AudioOutput output = audiooutFind(id);
	if (output)
		output->sampleRate = sampleRate;
}

void xs_audioout_constructor_(xsMachine* the)
{
	uint8_t format = kIOFormatBuffer;
	xsStringValue type;
	int bitsPerSample = 0;
	int numChannels = 0;
	int sampleRate = 0;
	uint16_t queueLength = 6;
	uint16_t bytesPerFrame = 0;
	uint32_t bufferSize = 0;
	AudioOutput output;
	xsmcVars(1);

#ifdef MODDEF_AUDIOOUT_BITSPERSAMPLE
	bitsPerSample = MODDEF_AUDIOOUT_BITSPERSAMPLE;
#endif
#ifdef MODDEF_AUDIOOUT_NUMCHANNELS
	numChannels = MODDEF_AUDIOOUT_NUMCHANNELS;
#endif
#ifdef MODDEF_AUDIOOUT_SAMPLERATE
	sampleRate = MODDEF_AUDIOOUT_SAMPLERATE;
#endif
#ifdef MODDEF_AUDIOOUT_QUEUELENGTH
	queueLength = MODDEF_AUDIOOUT_QUEUELENGTH;
#endif
	format = builtinInitializeFormat(the, format);
	if (kIOFormatBuffer != format)
		xsRangeError("invalid format");
	if (xsmcHas(xsArg(0), xsID_audioType)) {
		xsmcGet(xsVar(0), xsArg(0), xsID_audioType);
		type = xsmcToString(xsVar(0));
		if (c_strcmp(type, "LPCM"))
			xsRangeError("invalid audioType");
	}
	if (xsmcHas(xsArg(0), xsID_bitsPerSample)) {
		xsmcGet(xsVar(0), xsArg(0), xsID_bitsPerSample);
		bitsPerSample = xsmcToInteger(xsVar(0));
	}
	if (xsmcHas(xsArg(0), xsID_channels)) {
		xsmcGet(xsVar(0), xsArg(0), xsID_channels);
		numChannels = xsmcToInteger(xsVar(0));
	}
	if (xsmcHas(xsArg(0), xsID_sampleRate)) {
		xsmcGet(xsVar(0), xsArg(0), xsID_sampleRate);
		sampleRate = xsmcToInteger(xsVar(0));
	}
	if (xsmcHas(xsArg(0), xsID_queueLength)) {
		xsmcGet(xsVar(0), xsArg(0), xsID_queueLength);
		queueLength = xsmcToInteger(xsVar(0));
	}
	if ((8 != bitsPerSample) && (16 != bitsPerSample))
		xsRangeError("invalid bits per sample");
	if ((1 != numChannels) && (2 != numChannels))
		xsRangeError("invalid number of channels");
	if ((sampleRate < 8000) || (sampleRate > 48000))
		xsRangeError("invalid sample rate %d", sampleRate);
	if (queueLength < 2)
		xsRangeError("invalid queue length");
	bytesPerFrame = (bitsPerSample * numChannels) >> 3;
	bufferSize = (bytesPerFrame * sampleRate) >> 5;

	output = c_calloc(1, sizeof(AudioOutputRecord));
	if (!output)
		xsRangeError("not enough memory");

	output->id = wasmAudioOutCreate(bitsPerSample, numChannels, sampleRate, bytesPerFrame, queueLength, bufferSize);
	if (!output->id) {
		c_free(output);
		xsUnknownError("cannot create audio output");
	}

	xsmcSetHostData(xsThis, output);
	xsSetHostHooks(xsThis, (xsHostHooks *)&xsAudioOutputHooks);

	output->volume = 1.0;
	output->bitsPerSample = (uint8_t)bitsPerSample;
	output->numChannels = (uint8_t)numChannels;
	output->sampleRate = (uint32_t)sampleRate;
	output->bytesPerFrame = bytesPerFrame;

	output->the = the;
	output->object = xsThis;
	xsRemember(output->object);
	output->onWritable = builtinGetCallback(the, xsID_onWritable);
	builtinInitializeTarget(the);

	wasmAudioOutSetVolume(output->id, output->volume);
	audiooutAdd(output);
}

void xs_audioout_destructor_(void *it)
{
	AudioOutput output = it;
	if (!output)
		return;

	wasmAudioOutDestroy(output->id);
	audiooutRemove(output);
	c_free(output);
}

void xs_audioout_close_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostData(xsThis);
	if (output && xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks)) {
		xsmcSetHostData(xsThis, NULL);
		xsmcSetHostDestructor(xsThis, NULL);
		xsForget(output->object);
		if (output->calling)
			output->calling = 0;
		else
			xs_audioout_destructor_(output);
	}
}

void xs_audioout_mark_(xsMachine* the, void* it, xsMarkRoot markRoot)
{
	AudioOutput output = it;
	if (output->onWritable)
		(*markRoot)(the, output->onWritable);
}

void xs_audioout_start_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	if (output->running)
		xsUnknownError("already started");
	output->running = 1;
	wasmAudioOutStart(output->id);
}

void xs_audioout_stop_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	output->running = 0;
	wasmAudioOutStop(output->id);
}

void xs_audioout_write_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	xsUnsignedValue length;
	void* buffer;
	int written;

	xsmcGetBufferReadable(xsArg(0), (void **)&buffer, &length);
	if (length <= 0)
		xsUnknownError("invalid size");

	written = wasmAudioOutWrite(output->id, buffer, length);
	if (written != (int)length)
		xsUnknownError("invalid size");

	xsmcSetInteger(xsResult, length);
}

void xs_audioout_get_format_(xsMachine* the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	builtinGetFormat(the, kIOFormatBuffer);
}

void xs_audioout_set_format_(xsMachine* the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	uint8_t format = builtinSetFormat(the);
	if (kIOFormatBuffer != format)
		xsRangeError("invalid format");
}

void xs_audioout_get_bitsPerSample_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	xsResult = xsInteger(output->bitsPerSample);
}

void xs_audioout_get_numChannels_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	xsResult = xsInteger(output->numChannels);
}

void xs_audioout_get_sampleRate_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	xsResult = xsInteger(output->sampleRate);
}

void xs_audioout_get_volume_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	xsResult = xsNumber(output->volume);
}

void xs_audioout_set_volume_(xsMachine* the)
{
	AudioOutput output = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioOutputHooks);
	xsNumberValue volume = xsmcToNumber(xsArg(0));
	if ((volume < 0) || (volume > 1))
		xsRangeError("invalid volume");
	output->volume = volume;
	wasmAudioOutSetVolume(output->id, volume);
}
