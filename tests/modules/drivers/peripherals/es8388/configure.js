/*---
description: ES8388 configures its DAC for 16-bit I2S output
flags: [module]
---*/

import configureES8388 from "embedded:peripheral/AudioCodec/ES8388";

class MockSMBus {
	static options;
	static writes = [];

	constructor(options) {
		MockSMBus.options = options;
	}
	close() {
		this.closed = true;
	}
	writeUint8(register, value) {
		MockSMBus.writes.push([register, value]);
	}
}

configureES8388({sensor: {io: MockSMBus}});
assert.sameValue(MockSMBus.options.address, 0x10);
assert.sameValue(MockSMBus.options.hz, 400_000);
assert.compareArray(MockSMBus.writes[0], [0x19, 0x04]);
assert.compareArray(MockSMBus.writes.at(-1), [0x19, 0x00]);
assert.sameValue(MockSMBus.writes.find(([register]) => 0x17 === register)[1], 0x18);
assert.sameValue(MockSMBus.writes.find(([register]) => 0x18 === register)[1], 0x02);
assert.sameValue(MockSMBus.writes.findLast(([register]) => 0x04 === register)[1], 0x3C);
assert.throws(TypeError, () => configureES8388({}));
