/*---
description: PI4IOE5V6408 exposes ECMA-419 Digital and DigitalBank providers
flags: [module]
---*/

import PI4IOE5V6408 from "embedded:io/provider/PI4IOE5V6408";

class MockI2C {
	static registers = new Uint8Array(256);
	static instances = [];

	constructor(options) {
		this.options = options;
		MockI2C.instances.push(this);
	}
	close() {
		this.closed = true;
	}
	write(buffer) {
		buffer = new Uint8Array(buffer);
		assert.sameValue(buffer.length, 2);
		MockI2C.registers[buffer[0]] = buffer[1];
	}
	writeRead(source, destination) {
		if (!ArrayBuffer.isView(source))
			source = new Uint8Array(source);
		if (!ArrayBuffer.isView(destination))
			destination = new Uint8Array(destination);
		destination[0] = MockI2C.registers[source[0]];
	}
}

MockI2C.registers[0x01] = 0xA5;
MockI2C.registers[0x07] = 0xFF;
const expander = new PI4IOE5V6408({
	address: 0x44,
	i2c: {io: MockI2C, data: 1, clock: 2}
});
const mock = MockI2C.instances[0];
assert.sameValue(mock.options.address, 0x44);
assert.sameValue(mock.options.hz, 400_000);
assert.sameValue(mock.options.data, 1);
assert.sameValue(mock.options.clock, 2);

const target = {};
const output = new expander.Digital({
	pin: 2,
	mode: expander.Digital.Output,
	target
});
assert.sameValue(output.target, target);
assert.sameValue(output.format, "number");
assert.sameValue(MockI2C.registers[0x03] & 0x04, 0x04);
assert.sameValue(MockI2C.registers[0x07] & 0x04, 0);
assert.sameValue(MockI2C.registers[0x0B] & 0x04, 0);
output.write(1);
assert.sameValue(MockI2C.registers[0x05] & 0x04, 0x04);
output.write(0);
assert.sameValue(MockI2C.registers[0x05] & 0x04, 0);
MockI2C.registers[0x0F] = 0x04;
assert.sameValue(output.read(), 1);
assert.throws(Error, () => new expander.Digital({
	pin: 2,
	mode: expander.Digital.Output
}));
assert.throws(RangeError, () => output.format = "buffer");
output.close();
output.close();
assert.throws(Error, () => output.write(1));

const pullDown = new expander.Digital({
	pin: 2,
	mode: expander.Digital.InputPullDown
});
assert.sameValue(MockI2C.registers[0x03] & 0x04, 0);
assert.sameValue(MockI2C.registers[0x0B] & 0x04, 0x04);
assert.sameValue(MockI2C.registers[0x0D] & 0x04, 0);
assert.throws(Error, () => pullDown.write(1));
pullDown.close();

const inputs = new expander.DigitalBank({
	pins: 0x30,
	mode: expander.DigitalBank.InputPullUp
});
assert.sameValue(MockI2C.registers[0x03] & 0x30, 0);
assert.sameValue(MockI2C.registers[0x0B] & 0x30, 0x30);
assert.sameValue(MockI2C.registers[0x0D] & 0x30, 0x30);
MockI2C.registers[0x0F] = 0x20;
assert.sameValue(inputs.read(), 0x20);
inputs.close();

assert.throws(RangeError, () => new expander.Digital({
	pin: 8,
	mode: expander.Digital.Input
}));
assert.throws(RangeError, () => new expander.DigitalBank({
	pins: 0,
	mode: expander.DigitalBank.Input
}));
assert.throws(RangeError, () => new expander.Digital({
	pin: 0,
	mode: expander.Digital.OutputOpenDrain
}));
assert.throws(RangeError, () => new expander.Digital({
	pin: 0,
	mode: expander.Digital.Input,
	edge: expander.Digital.Rising,
	onReadable() {}
}));

expander.close();
expander.close();
assert.sameValue(mock.closed, true);
