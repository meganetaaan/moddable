/*---
description: ES7210 configures two microphones for 16-bit I2S
flags: [module]
---*/

import configureES7210 from "embedded:peripheral/AudioCodec/ES7210";

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

configureES7210({sensor: {io: MockSMBus}});
assert.sameValue(MockSMBus.options.address, 0x40);
assert.sameValue(MockSMBus.options.hz, 400_000);
assert.compareArray(MockSMBus.writes[0], [0x00, 0xFF]);
assert.compareArray(MockSMBus.writes.at(-1), [0x01, 0x14]);
assert.sameValue(MockSMBus.writes.find(([register]) => 0x11 === register)[1], 0x60);
assert.sameValue(MockSMBus.writes.find(([register]) => 0x4B === register)[1], 0x00);
assert.sameValue(MockSMBus.writes.find(([register]) => 0x4C === register)[1], 0xFF);
assert.throws(TypeError, () => configureES7210({}));
