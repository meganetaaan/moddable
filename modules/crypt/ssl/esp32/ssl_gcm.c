/*
 * Copyright (c) 2026 Shinya Ishikawa
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "xsmc.h"

#include "aes/esp_aes_gcm.h"
#include "esp_heap_caps.h"
#include "esp_memory_utils.h"
#include "psa/crypto_values.h"

#include <stdint.h>
#include <string.h>

#define ESP32_GCM_MINIMUM_TAG_LENGTH 4
#define ESP32_GCM_MAXIMUM_TAG_LENGTH 16
#define ESP32_GCM_DECRYPT_INPUT_OFFSET 16
// esp_aes_gcm_setkey accepts the Mbed TLS cipher-id as an int, but its public
// header does not export that enum. The cipher-id for AES is 2.
#define ESP32_GCM_CIPHER_ID_AES 2

typedef struct {
	esp_gcm_context context;
	uint8_t tagLength;
	uint8_t initialized;
} ESP32GCMRecord;

static uint8_t *esp32_gcm_allocate_dma(size_t size)
{
	return heap_caps_malloc(size, MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA | MALLOC_CAP_8BIT);
}

static const uint8_t *esp32_gcm_prepare_aad(
	const uint8_t *aad,
	size_t aadLength,
	uint8_t **allocated
)
{
	*allocated = NULL;
	if (!aadLength || esp_ptr_dma_capable(aad))
		return aad;

	*allocated = esp32_gcm_allocate_dma(aadLength);
	if (*allocated)
		memcpy(*allocated, aad, aadLength);
	return *allocated;
}

void xs_esp32_gcm_destructor(void *data)
{
	ESP32GCMRecord *gcm = data;
	if (gcm && gcm->initialized) {
		esp_aes_gcm_free(&gcm->context);
		gcm->initialized = 0;
	}
}

void xs_esp32_gcm_constructor(xsMachine *the)
{
	uint8_t *key;
	xsUnsignedValue keyLength;
	xsmcGetBufferReadable(xsArg(0), (void **)&key, &keyLength);
	if ((keyLength != 16) && (keyLength != 24) && (keyLength != 32))
		xsRangeError("AES-GCM key must be 16, 24, or 32 bytes");

	xsIntegerValue tagLength = (xsmcArgc > 1) ? xsmcToInteger(xsArg(1)) : ESP32_GCM_MAXIMUM_TAG_LENGTH;
	if ((tagLength < ESP32_GCM_MINIMUM_TAG_LENGTH) || (tagLength > ESP32_GCM_MAXIMUM_TAG_LENGTH))
		xsRangeError("AES-GCM tag length must be between 4 and 16 bytes");

	ESP32GCMRecord *gcm = xsmcSetHostChunk(xsThis, NULL, sizeof(ESP32GCMRecord));
	gcm->tagLength = (uint8_t)tagLength;
	gcm->initialized = 0;

	// Allocating the movable host chunk may trigger GC, so reacquire the key.
	xsmcGetBufferReadable(xsArg(0), (void **)&key, &keyLength);
	esp_aes_gcm_init(&gcm->context);
	gcm->initialized = 1;
	const int result = esp_aes_gcm_setkey(
		&gcm->context,
		ESP32_GCM_CIPHER_ID_AES,
		key,
		keyLength * 8
	);
	if (result != 0) {
		esp_aes_gcm_free(&gcm->context);
		gcm->initialized = 0;
		xsUnknownError("unable to initialize ESP32 AES-GCM: status %d", result);
	}
}

void xs_esp32_gcm_process(xsMachine *the)
{
	ESP32GCMRecord *gcm = xsmcGetHostChunk(xsThis);
	if (!gcm || !gcm->initialized)
		xsUnknownError("AES-GCM is closed");

	uint8_t *input;
	uint8_t *iv;
	xsUnsignedValue inputLength;
	xsUnsignedValue ivLength;
	xsmcGetBufferReadable(xsArg(0), (void **)&input, &inputLength);
	xsmcGetBufferReadable(xsArg(2), (void **)&iv, &ivLength);

	uint8_t *aad = NULL;
	xsUnsignedValue aadLength = 0;
	if ((xsmcArgc > 3) && xsmcTest(xsArg(3)))
		xsmcGetBufferReadable(xsArg(3), (void **)&aad, &aadLength);

	const uint8_t encrypt = (xsmcArgc > 4) && xsmcToBoolean(xsArg(4));
	if (encrypt) {
		const xsUnsignedValue outputSize = inputLength + gcm->tagLength;
		xsmcSetArrayBuffer(xsResult, NULL, outputSize);
		gcm = xsmcGetHostChunk(xsThis);
		uint8_t *output = xsmcToArrayBuffer(xsResult);
		xsmcGetBufferReadable(xsArg(0), (void **)&input, &inputLength);
		xsmcGetBufferReadable(xsArg(2), (void **)&iv, &ivLength);
		if ((xsmcArgc > 3) && xsmcTest(xsArg(3)))
			xsmcGetBufferReadable(xsArg(3), (void **)&aad, &aadLength);

		uint8_t *working = esp32_gcm_allocate_dma(outputSize);
		if (!working)
			xsUnknownError("unable to allocate ESP32 AES-GCM DMA buffer");
		memcpy(working, input, inputLength);

		uint8_t *allocatedAAD;
		const uint8_t *hardwareAAD = esp32_gcm_prepare_aad(aad, aadLength, &allocatedAAD);
		if (aadLength && !hardwareAAD) {
			heap_caps_free(working);
			xsUnknownError("unable to allocate ESP32 AES-GCM AAD buffer");
		}

		const int result = esp_aes_gcm_crypt_and_tag(
			&gcm->context,
			ESP_AES_ENCRYPT,
			inputLength,
			iv,
			ivLength,
			hardwareAAD,
			aadLength,
			working,
			working,
			gcm->tagLength,
			working + inputLength
		);
		if (allocatedAAD)
			heap_caps_free(allocatedAAD);
		if (result != 0) {
			heap_caps_free(working);
			xsUnknownError("ESP32 AES-GCM encryption failed: status %d", result);
		}
		memcpy(output, working, outputSize);
		heap_caps_free(working);
		return;
	}

	if (inputLength < gcm->tagLength)
		return;

	const xsUnsignedValue plaintextLength = inputLength - gcm->tagLength;
	xsmcSetArrayBufferResizable(xsResult, NULL, plaintextLength, plaintextLength);
	gcm = xsmcGetHostChunk(xsThis);
	uint8_t *output = xsmcToArrayBuffer(xsResult);
	xsmcGetBufferReadable(xsArg(0), (void **)&input, &inputLength);
	xsmcGetBufferReadable(xsArg(2), (void **)&iv, &ivLength);
	if ((xsmcArgc > 3) && xsmcTest(xsArg(3)))
		xsmcGetBufferReadable(xsArg(3), (void **)&aad, &aadLength);

	uint8_t *working = esp32_gcm_allocate_dma(inputLength + ESP32_GCM_DECRYPT_INPUT_OFFSET);
	if (!working)
		xsUnknownError("unable to allocate ESP32 AES-GCM DMA buffer");
	uint8_t *hardwareInput = working + ESP32_GCM_DECRYPT_INPUT_OFFSET;
	memcpy(hardwareInput, input, inputLength);
	uint8_t authenticationTag[ESP32_GCM_MAXIMUM_TAG_LENGTH];
	memcpy(authenticationTag, hardwareInput + plaintextLength, gcm->tagLength);

	uint8_t *allocatedAAD;
	const uint8_t *hardwareAAD = esp32_gcm_prepare_aad(aad, aadLength, &allocatedAAD);
	if (aadLength && !hardwareAAD) {
		heap_caps_free(working);
		xsUnknownError("unable to allocate ESP32 AES-GCM AAD buffer");
	}

	const int result = esp_aes_gcm_auth_decrypt(
		&gcm->context,
		plaintextLength,
		iv,
		ivLength,
		hardwareAAD,
		aadLength,
		authenticationTag,
		gcm->tagLength,
		hardwareInput,
		working
	);
	if (allocatedAAD)
		heap_caps_free(allocatedAAD);
	if (result == PSA_ERROR_INVALID_SIGNATURE) {
		heap_caps_free(working);
		xsmcSetUndefined(xsResult);
	}
	else if (result != 0) {
		heap_caps_free(working);
		xsUnknownError("ESP32 AES-GCM decryption failed: status %d", result);
	}
	else {
		if (plaintextLength)
			memcpy(output, working, plaintextLength);
		heap_caps_free(working);
	}
}
