/*---
description:
flags: [module]
---*/

import {isSensitiveKey, isUserKey} from "../../../contributed/modclaw/modules/memoryKeys.js";

assert(isUserKey("u_name"));
assert(isUserKey("u_temp1"));
assert(!isUserKey("name"));
assert(!isUserKey("wifi_ssid"));
assert(!isUserKey(""));
assert(!isUserKey(null));

assert(isSensitiveKey("api_key"));
assert(isSensitiveKey("tg_token"));
assert(isSensitiveKey("tg_chat_id"));
assert(isSensitiveKey("tg_chat_ids"));
assert(isSensitiveKey("wifi_pass"));
assert(isSensitiveKey("llm_backend"));
assert(isSensitiveKey("llm_model"));
assert(isSensitiveKey("llm_api_url"));
assert(isSensitiveKey("wifi_ssid"));

assert(!isSensitiveKey("u_name"));
assert(!isSensitiveKey("u_api_key"));
assert(!isSensitiveKey("nickname"));
assert(!isSensitiveKey(null));
