/*---
description:
flags: [module]
---*/

import {
	containsUserId,
	parseUserIds,
} from "../../../contributed/modclaw/modules/slack.js";

let ids = parseUserIds("U12345678");
assert.sameValue(ids.length, 1);
assert.sameValue(ids[0], "U12345678");

ids = parseUserIds(" u12345678, WABCDEFGH ,u12345678 ");
assert.sameValue(ids.length, 2);
assert.sameValue(ids[0], "U12345678");
assert.sameValue(ids[1], "WABCDEFGH");

assert.sameValue(parseUserIds(""), null);
assert.sameValue(parseUserIds("123"), null);
assert.sameValue(parseUserIds("user"), null);
assert.sameValue(parseUserIds("U1,U2,U3,U4,U5"), null);

assert(containsUserId(ids, "u12345678"));
assert(containsUserId(ids, "WABCDEFGH"));
assert(!containsUserId(ids, "U00000000"));
