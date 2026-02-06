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

typedef struct AudioInputRecord AudioInputRecord;
typedef struct AudioInputRecord *AudioInput;

struct AudioInputRecord {
	xsMachine *the;
	xsSlot object;
	xsSlot *onReadable;
	uint8_t bitsPerSample;
	uint8_t numChannels;
	uint32_t sampleRate;
	uint16_t bytesPerFrame;
	uint8_t running;
	uint8_t calling;
	uint8_t callbackPending;
	uint32_t pendingBytes;
	uint32_t id;
	AudioInput next;
};

static void xs_audioin_mark(xsMachine* the, void* it, xsMarkRoot markRoot);

static const xsHostHooks xsAudioInputHooks = {
	xs_audioin_destructor,
	xs_audioin_mark,
	NULL
};

static AudioInput gAudioInputs = NULL;

static AudioInput audioinFind(uint32_t id)
{
	AudioInput input = gAudioInputs;
	while (input) {
		if (input->id == id)
			return input;
		input = input->next;
	}
	return NULL;
}

static void audioinAdd(AudioInput input)
{
	input->next = gAudioInputs;
	gAudioInputs = input;
}

static void audioinRemove(AudioInput input)
{
	AudioInput *walker = &gAudioInputs;
	while (*walker) {
		if (*walker == input) {
			*walker = input->next;
			return;
		}
		walker = &((*walker)->next);
	}
}

EM_JS(uint32_t, wasmAudioInCreate, (uint32_t bitsPerSample, uint32_t numChannels, uint32_t sampleRate, uint32_t bytesPerFrame, uint32_t queueLength, uint32_t bufferSize), {
	if (!globalThis.gxAudio)
		return 0;
	return globalThis.gxAudio.createIn(bitsPerSample, numChannels, sampleRate, bytesPerFrame, queueLength, bufferSize);
});

EM_JS(void, wasmAudioInDestroy, (uint32_t id), {
	if (globalThis.gxAudio)
		globalThis.gxAudio.destroyIn(id);
});

EM_JS(void, wasmAudioInStart, (uint32_t id), {
	if (globalThis.gxAudio)
		globalThis.gxAudio.startIn(id);
});

EM_JS(void, wasmAudioInStop, (uint32_t id), {
	if (globalThis.gxAudio)
		globalThis.gxAudio.stopIn(id);
});

EM_JS(int, wasmAudioInRead, (uint32_t id, uint8_t *buffer, uint32_t length), {
	if (!globalThis.gxAudio)
		return -1;
	return globalThis.gxAudio.readIn(id, buffer, length);
});

EM_JS(uint32_t, wasmAudioInAvailable, (uint32_t id), {
	if (!globalThis.gxAudio)
		return 0;
	return globalThis.gxAudio.availableIn(id);
});

static void audioinDeliver(void *it)
{
	AudioInput input = it;
	uint32_t bytes;

	if (!input || !input->callbackPending)
		return;

	bytes = input->pendingBytes;
	input->pendingBytes = 0;
	input->callbackPending = 0;

	if (!input->onReadable || !input->running)
		return;

	input->calling = 1;
	xsBeginHost(input->the);
	xsResult = xsAccess(input->object);
	xsCallFunction2(xsReference(input->onReadable), xsResult, xsInteger(bytes), xsInteger(bytes / input->bytesPerFrame));
	xsEndHost(input->the);
	if (input->calling)
		input->calling = 0;
	else
		xs_audioin_destructor(input);
}

EMSCRIPTEN_KEEPALIVE void modAudioInReadable(uint32_t id, uint32_t bytes)
{
	AudioInput input = audioinFind(id);
	if (!input || input->callbackPending || !input->running)
		return;
	if (!input->onReadable || (0 == bytes))
		return;
	input->callbackPending = 1;
	input->pendingBytes = bytes;
	emscripten_async_call(audioinDeliver, input, 0);
}

EMSCRIPTEN_KEEPALIVE void modAudioInSetSampleRate(uint32_t id, uint32_t sampleRate)
{
	AudioInput input = audioinFind(id);
	if (input)
		input->sampleRate = sampleRate;
}

void xs_audioin_constructor(xsMachine *the)
{
	uint8_t format = kIOFormatBuffer;
	xsStringValue type;
	uint8_t bitsPerSample = 0;
	uint8_t numChannels = 0;
	unsigned int sampleRate = 0;
	uint16_t queueLength = 8;
	uint16_t bytesPerFrame = 0;
	uint32_t bufferSize = 0;
	AudioInput input;
	xsmcVars(1);

#ifdef MODDEF_AUDIOIN_BITSPERSAMPLE
	bitsPerSample = MODDEF_AUDIOIN_BITSPERSAMPLE;
#endif
#ifdef MODDEF_AUDIOIN_NUMCHANNELS
	numChannels = MODDEF_AUDIOIN_NUMCHANNELS;
#endif
#ifdef MODDEF_AUDIOIN_SAMPLERATE
	sampleRate = MODDEF_AUDIOIN_SAMPLERATE;
#endif
#ifdef MODDEF_AUDIOIN_QUEUELENGTH
	queueLength = MODDEF_AUDIOIN_QUEUELENGTH;
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
		xsRangeError("invalid sample rate");
	if (queueLength < 2)
		xsRangeError("invalid queue length");
	bytesPerFrame = (bitsPerSample * numChannels) >> 3;
	bufferSize = (bytesPerFrame * sampleRate) >> 5;

	input = c_calloc(1, sizeof(AudioInputRecord));
	if (!input)
		xsRangeError("not enough memory");

	input->id = wasmAudioInCreate(bitsPerSample, numChannels, sampleRate, bytesPerFrame, queueLength, bufferSize);
	if (!input->id) {
		c_free(input);
		xsUnknownError("cannot create audio input");
	}

	xsmcSetHostData(xsThis, input);
	xsSetHostHooks(xsThis, (xsHostHooks *)&xsAudioInputHooks);

	input->bitsPerSample = bitsPerSample;
	input->numChannels = numChannels;
	input->sampleRate = sampleRate;
	input->bytesPerFrame = bytesPerFrame;

	input->the = the;
	input->object = xsThis;
	xsRemember(input->object);
	input->onReadable = builtinGetCallback(the, xsID_onReadable);
	builtinInitializeTarget(the);

	audioinAdd(input);
}

void xs_audioin_destructor(void *it)
{
	AudioInput input = it;
	if (!input)
		return;

	wasmAudioInDestroy(input->id);
	audioinRemove(input);
	c_free(input);
}

void xs_audioin_close(xsMachine *the)
{
	AudioInput input = xsmcGetHostData(xsThis);
	if (input && xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks)) {
		xsmcSetHostData(xsThis, NULL);
		xsmcSetHostDestructor(xsThis, NULL);
		xsForget(input->object);
		if (input->calling)
			input->calling = 0;
		else
			xs_audioin_destructor(input);
	}
}

void xs_audioin_mark(xsMachine* the, void* it, xsMarkRoot markRoot)
{
	AudioInput input = it;
	if (input->onReadable)
		(*markRoot)(the, input->onReadable);
}

void xs_audioin_read(xsMachine *the)
{
	AudioInput input = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	xsUnsignedValue available, requested;
	xsBooleanValue allocate = 1;
	void* buffer;
	int read;

	available = wasmAudioInAvailable(input->id);
	if (0 == xsmcArgc)
		requested = available;
	else if (xsReferenceType == xsmcTypeOf(xsArg(0))) {
		xsResult = xsArg(0);
		xsmcGetBufferWritable(xsResult, (void **)&buffer, &requested);
		xsmcSetInteger(xsResult, requested);
		allocate = 0;
	}
	else
		requested = xsmcToInteger(xsArg(0));

	if ((requested <= 0) || (requested > available))
		xsUnknownError("invalid size");
	if (allocate)
		buffer = xsmcSetArrayBuffer(xsResult, NULL, requested);

	read = wasmAudioInRead(input->id, buffer, requested);
	if (read != (int)requested)
		xsUnknownError("invalid size");
}

void xs_audioin_start(xsMachine *the)
{
	AudioInput input = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	input->running = 1;
	wasmAudioInStart(input->id);
}

void xs_audioin_stop(xsMachine *the)
{
	AudioInput input = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	input->running = 0;
	wasmAudioInStop(input->id);
}

void xs_audioin_get_format(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	builtinGetFormat(the, kIOFormatBuffer);
}

void xs_audioin_set_format(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	uint8_t format = builtinSetFormat(the);
	if (kIOFormatBuffer != format)
		xsRangeError("invalid format");
}

void xs_audioin_get_bitsPerSample(xsMachine *the)
{
	AudioInput input = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	xsResult = xsInteger(input->bitsPerSample);
}

void xs_audioin_get_numChannels(xsMachine *the)
{
	AudioInput input = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	xsResult = xsInteger(input->numChannels);
}

void xs_audioin_get_sampleRate(xsMachine *the)
{
	AudioInput input = xsmcGetHostDataValidate(xsThis, (void *)&xsAudioInputHooks);
	xsResult = xsInteger(input->sampleRate);
}

