/*---
description: INA226 configures calibration and reports energy measurements
flags: [module]
---*/

import INA226 from "embedded:sensor/Energy/INA226";

class MockSMBus {
	static registers = new Uint16Array(256);
	static options;

	constructor(options) {
		MockSMBus.options = options;
	}
	close() {
		this.closed = true;
	}
	readUint16(register, bigEndian) {
		assert.sameValue(bigEndian, true);
		return MockSMBus.registers[register];
	}
	writeUint16(register, value, bigEndian) {
		assert.sameValue(bigEndian, true);
		MockSMBus.registers[register] = value;
	}
}

MockSMBus.registers[0xFF] = 0x2260;
const target = {};
const sensor = new INA226({target, sensor: {io: MockSMBus}});
assert.sameValue(sensor.target, target);
assert.sameValue(MockSMBus.options.address, 0x40);
assert.sameValue(MockSMBus.options.hz, 400_000);
assert.sameValue(MockSMBus.registers[0x00], 0x0527);
assert.sameValue(MockSMBus.registers[0x05], 4096);
assert.sameValue(sensor.configuration.shuntResistance, 0.005);
assert.sameValue(sensor.configuration.maximumCurrent, 8.192);

MockSMBus.registers[0x01] = 0xFE70;
MockSMBus.registers[0x02] = 8000;
MockSMBus.registers[0x03] = 160;
MockSMBus.registers[0x04] = 4000;
const sample = sensor.sample();
assert.sameValue(sample.voltage, 10);
assert.sameValue(sample.current, 1);
assert.sameValue(sample.power, 1);
assert.sameValue(sample.shuntVoltage, -400 * 0.0000025);
assert.notSameValue(sensor.sample(), sample);

sensor.configure({maximumCurrent: 4.096});
assert.sameValue(MockSMBus.registers[0x05], 8192);
assert.sameValue(sensor.configuration.maximumCurrent, 4.096);
assert.throws(RangeError, () => sensor.configure({shuntResistance: 0}));
assert.throws(RangeError, () => sensor.configure({maximumCurrent: Number.POSITIVE_INFINITY}));

sensor.close();
sensor.close();
assert.throws(Error, () => sensor.configuration);
assert.throws(TypeError, () => sensor.sample());

MockSMBus.registers[0xFF] = 0;
assert.throws(Error, () => new INA226({sensor: {io: MockSMBus}}));
