/*---
description:
flags: [module]
---*/

import {
	LLM_API_KEY_MAX_LENGTH,
	LLM_AUTH_HEADER_BUF_SIZE,
} from "../../../contributed/zclaw/modules/config.js";
import {
	buildLLMBearerAuthHeader,
	copyLLMApiKey,
} from "../../../contributed/zclaw/modules/llmAuth.js";

assert(LLM_API_KEY_MAX_LENGTH >= 256);
assert(LLM_AUTH_HEADER_BUF_SIZE > ("Bearer ".length + LLM_API_KEY_MAX_LENGTH));

assert.sameValue(copyLLMApiKey("k".repeat(320)), "k".repeat(320));
assert.sameValue(copyLLMApiKey("x".repeat(LLM_API_KEY_MAX_LENGTH + 1)), null);

const header = buildLLMBearerAuthHeader("a".repeat(300));
assert.sameValue(true, header.startsWith("Bearer "));
assert.sameValue("a".repeat(300), header.slice(7));
assert.sameValue(null, buildLLMBearerAuthHeader("abc", 8));
