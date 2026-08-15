/*---
description: ST7121 and ST7123 touch reports are decoded through their shared protocol
flags: [module]
---*/

import ST712x from "embedded:sensor/Touch/ST712x";

class MockI2C {
	static status = 0;
	static coordinates = new Uint8Array(14);

	constructor(options) {
		assert.sameValue(options.address, 0x55);
		assert.sameValue(options.hz, 400_000);
	}
	close() {
		this.closed = true;
	}
	writeRead(register, destination) {
		register = new Uint8Array(register);
		const address = (register[0] << 8) | register[1];
		if (0x0000 === address)
			destination[0] = 3;
		else if (0x0009 === address)
			destination[0] = 2;
		else if (0x0010 === address)
			destination[0] = MockI2C.status;
		else if (0x0014 === address)
			destination.set(MockI2C.coordinates.subarray(0, destination.length));
		else
			throw new Error("unexpected register");
	}
}

const touch = new ST712x({sensor: {io: MockI2C}});
assert.sameValue(touch.configuration.interrupt, false);
assert.sameValue(touch.configuration.length, 2);
assert.throws(RangeError, () => touch.configure({length: 3}));

MockI2C.status = 0x08;
MockI2C.coordinates.set([
	0x81, 0x23, 0x04, 0x56, 7, 8, 0,
	0x82, 0x34, 0x05, 0x67, 9, 10, 0
]);
const points = touch.sample();
assert.sameValue(points.length, 2);
assert.sameValue(points[0].id, 0);
assert.sameValue(points[0].x, 0x123);
assert.sameValue(points[0].y, 0x456);
assert.sameValue(points[0].size, 7);
assert.sameValue(points[0].intensity, 8);
assert.sameValue(points[1].id, 1);
assert.sameValue(points[1].x, 0x234);
assert.sameValue(points[1].y, 0x567);

MockI2C.status = 0;
assert.sameValue(touch.sample().length, 0);
touch.close();
