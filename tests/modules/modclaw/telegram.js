/*---
description:
flags: [module]
---*/

import {
	extractBotId,
	parseChatIds,
	containsChatId,
	resolveTargetChatId,
	pollTimeoutForBackend,
	extractMaxUpdateId,
} from "../../../contributed/modclaw/modules/telegram.js";
import {LLM_BACKENDS} from "../../../contributed/modclaw/modules/config.js";

assert.sameValue(extractBotId("8291539104:AAGxpPliHXAghCqdmIlQwPMwcrF-4ibBpgk"), "8291539104");
assert.sameValue(extractBotId("8291539104AAGxpPliHXAghCqdmIlQwPMwcrF-4ibBpgk"), null);
assert.sameValue(extractBotId("bot8291539104:AAGxpPliHXAghCqdmIlQwPMwcrF-4ibBpgk"), null);
assert.sameValue(extractBotId("8291539104:secret", 4), null);

let ids = parseChatIds("7585013353");
assert.sameValue(ids.length, 1);
assert.sameValue(ids[0], 7585013353);

ids = parseChatIds(" 7585013353, -100222333444 ,7585013353 ");
assert.sameValue(ids.length, 2);
assert.sameValue(ids[0], 7585013353);
assert.sameValue(ids[1], -100222333444);

assert.sameValue(parseChatIds(""), null);
assert.sameValue(parseChatIds("abc"), null);
assert.sameValue(parseChatIds("0"), null);
assert.sameValue(parseChatIds("1,2,3,4,5"), null);

assert(containsChatId(ids, 7585013353));
assert(containsChatId(ids, -100222333444));
assert(!containsChatId(ids, 11111111));

assert.sameValue(resolveTargetChatId(ids, 7585013353, 0), 7585013353);
assert.sameValue(resolveTargetChatId(ids, 7585013353, -100222333444), -100222333444);
assert.sameValue(resolveTargetChatId(ids, 7585013353, 99999999), 0);

assert.sameValue(pollTimeoutForBackend(LLM_BACKENDS.ANTHROPIC), 30);
assert.sameValue(pollTimeoutForBackend(LLM_BACKENDS.OPENAI), 30);
assert.sameValue(pollTimeoutForBackend(LLM_BACKENDS.OPENROUTER), 8);
assert.sameValue(pollTimeoutForBackend(LLM_BACKENDS.ANTHROPIC, {classicEsp32Target: true}), 5);
assert.sameValue(pollTimeoutForBackend(LLM_BACKENDS.OPENROUTER, {classicEsp32Target: true}), 5);
assert.sameValue(pollTimeoutForBackend("unknown"), 30);

assert.sameValue(extractMaxUpdateId("{\"result\":[{\"update_id\":123}]}"), 123);
assert.sameValue(extractMaxUpdateId("{\"result\":[{\"update_id\":10},{\"update_id\":999},{\"update_id\":57}]}"), 999);
assert.sameValue(extractMaxUpdateId("{\"result\":[{\"update_id\":2147483648},{\"update_id\":5000000000}]}"), 5000000000);
assert.sameValue(extractMaxUpdateId("{\"result\":[{\"update_id\":42},{\"update_id\":9876543210},"), 9876543210);
assert.sameValue(extractMaxUpdateId("{\"result\":[]}"), null);
assert.sameValue(extractMaxUpdateId("{\"update_id\":-1}"), null);
assert.sameValue(extractMaxUpdateId(null), null);
