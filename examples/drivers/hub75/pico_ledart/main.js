import Time from "time";

const hub75 = device?.pin?.hub75;
if (!hub75)
	throw new Error("hub75 pin mapping is not available. Build with the pico_ledart target.");

const {Digital, DigitalBank} = device.io;

const WIDTH = hub75.width ?? 64;
const HALF_ROWS = hub75.scanLines ?? (hub75.height ? hub75.height >> 1 : 16);
const PLANES = hub75.colorDepth ?? 5;
const BASE_PULSE = hub75.basePulse ?? 8; // microseconds for plane 0

const dataPins = hub75.dataPins ?? [];
const addrPins = hub75.addrPins ?? [];

if ((dataPins.length !== 6) || (addrPins.length < 3))
	throw new Error("hub75 pin arrays are incomplete");

const DATA_BITS = dataPins.map(pin => 1 << (pin & 0x1F));
const ADDR_BITS = addrPins.map(pin => 1 << (pin & 0x1F));

const planeDurations = new Uint16Array(PLANES);
for (let plane = 0; plane < PLANES; plane++)
	planeDurations[plane] = BASE_PULSE << plane;

const rowAddressMask = new Uint32Array(HALF_ROWS);
for (let row = 0; row < HALF_ROWS; row++) {
	let mask = 0;
	for (let bit = 0; bit < ADDR_BITS.length; bit++) {
		if (row & (1 << bit))
			mask |= ADDR_BITS[bit];
	}
	rowAddressMask[row] = mask;
}

const CLOCK_BIT = 1 << (hub75.clk & 0x1F);
const dataClockMask = hub75.dataMask | CLOCK_BIT;

const dataClock = new DigitalBank({
    pins: dataClockMask,
    bank: hub75.dataBank,
    mode: DigitalBank.Output,
});

const addr = new DigitalBank({
	pins: hub75.addrMask,
	bank: hub75.addrBank,
	mode: DigitalBank.Output,
});

const lat = new Digital({ pin: hub75.lat, mode: Digital.Output });
const oe = new Digital({ pin: hub75.oe, mode: Digital.Output });

dataClock.write(0);
addr.write(0);
lat.write(0);
oe.write(1);

if (!("microseconds" in Time))
	throw new Error("Time.microseconds is required on this target");

const getMicros = () => Time.microseconds;

function delayMicroseconds(us) {
	const deadline = getMicros() + us;
	while (getMicros() < deadline) /* busy wait */;
}

function createBitplanes() {
	return Array.from({ length: PLANES }, () => new Uint32Array(HALF_ROWS * WIDTH));
}

let activeBitplanes = createBitplanes();

function renderBitplanes(target) {
	const basePlane = target[0];
	const fullRed = DATA_BITS[0] | DATA_BITS[3];
	basePlane.fill(fullRed);
	for (let plane = 1; plane < PLANES; plane++)
		target[plane].fill(fullRed);
}

renderBitplanes(activeBitplanes);

function pushRow(row, plane) {
	oe.write(1);
	lat.write(0);

	const planeBuffer = activeBitplanes[plane];
	const baseIndex = row * WIDTH;
	for (let column = 0; column < WIDTH; column++) {
		const bits = planeBuffer[baseIndex + column];
		dataClock.write(bits);
		dataClock.write(bits | CLOCK_BIT);
		dataClock.write(bits);
	}

	addr.write(rowAddressMask[row]);
	lat.write(1);
	lat.write(0);

	oe.write(0);
	delayMicroseconds(planeDurations[plane]);
	oe.write(1);
}

while (true) {
	for (let plane = 0; plane < PLANES; plane++) {
		for (let row = 0; row < HALF_ROWS; row++)
			pushRow(row, plane);
	}
}
