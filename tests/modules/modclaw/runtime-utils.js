/*---
description:
flags: [module]
---*/

import {
	BOOT_OK_TASK_STACK_SIZE,
	CHANNEL_RX_BUF_SIZE,
	TELEGRAM_MAX_MSG_LEN,
	TELEGRAM_OUTPUT_QUEUE_LENGTH,
} from "../../../contributed/zclaw/modules/config.js";
import {securityKeyIsSensitive} from "../../../contributed/zclaw/modules/security.js";
import {TextBuffer} from "../../../contributed/zclaw/modules/textBuffer.js";

assert.sameValue(true, securityKeyIsSensitive("wifi_pass"));
assert.sameValue(true, securityKeyIsSensitive("tg_token"));
assert.sameValue(true, securityKeyIsSensitive("api_key"));
assert.sameValue(false, securityKeyIsSensitive("wifi_ssid"));
assert.sameValue(false, securityKeyIsSensitive("nickname"));

const buffer = new TextBuffer(8);
assert.sameValue(true, buffer.append("hello"));
assert.sameValue(5, buffer.length);
assert.sameValue("hello", buffer.toString());
assert.sameValue(true, buffer.append("!!"));
assert.sameValue(7, buffer.length);
assert.sameValue("hello!!", buffer.toString());
assert.sameValue(false, buffer.append("x"));
assert.sameValue(7, buffer.length);
assert.sameValue("hello!!", buffer.toString());

assert.sameValue(true, BOOT_OK_TASK_STACK_SIZE >= 4096);
assert.sameValue(true, TELEGRAM_MAX_MSG_LEN > CHANNEL_RX_BUF_SIZE);
assert.sameValue(true, TELEGRAM_OUTPUT_QUEUE_LENGTH > 0);
