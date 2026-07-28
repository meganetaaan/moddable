/*
 * Copyright (c) 2026 Shinya Ishikawa
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export default class GCM extends Native("xs_esp32_gcm_destructor") {
	constructor(key, tagLength = 16) {
		super();
		native("xs_esp32_gcm_constructor").call(this, key, tagLength);
		this.tagLength = tagLength;
	}

	process(data, buffer, iv, aad, encrypt) {
		const result = native("xs_esp32_gcm_process").call(this, data, buffer, iv, aad, encrypt);
		if (!encrypt && (result !== undefined))
			return new Uint8Array(result);
		return result;
	}
}
