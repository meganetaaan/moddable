import Digital from "embedded:io/digital";
import DigitalBank from "embedded:io/digitalbank";
import Hub75 from "embedded:io/hub75";

function freezeArray(source) {
	return Object.freeze(Array.from(source));
}

function computeBankInfo(pins) {
	if (!pins.length)
		throw new Error("hub75 pin list is empty");
	let bank = pins[0] >> 5;
	let mask = 0;
	for (const pin of pins) {
		const currentBank = pin >> 5;
		if (currentBank !== bank)
			throw new Error("hub75 pins must reside on the same bank");
		mask |= 1 << (pin & 0x1F);
	}
	return {bank, mask};
}

const dataPins = freezeArray([0, 1, 2, 3, 4, 5]);
const addrPins = freezeArray([6, 7, 8, 9]);

const dataInfo = computeBankInfo(dataPins);
const addrInfo = computeBankInfo(addrPins);

const hub75 = Object.freeze({
	width: 64,
	height: 32,
	colorDepth: 4,
	scanLines: 16,
	basePulse: 4,
	dataPins,
	addrPins,
	dataMask: dataInfo.mask,
	dataBank: dataInfo.bank,
	addrMask: addrInfo.mask,
	addrBank: addrInfo.bank,
	clk: 11,
	lat: 12,
	oe: 13
});

const device = {
	io: { Digital, DigitalBank, Hub75 },
	pin: { hub75 },
	peripheral: {
		Hub75: class {
			constructor(options = {}) {
				const pin = options.pin ?? {};
				const size = options.size ?? {};
				const config = {
					...options,
					pin: {
						data: pin.data ?? hub75.dataPins,
						addr: pin.addr ?? hub75.addrPins,
						clk: pin.clk ?? hub75.clk,
						lat: pin.lat ?? hub75.lat,
						oe: pin.oe ?? hub75.oe
					},
					size: {
						width: size.width ?? hub75.width,
						height: size.height ?? hub75.height,
						colorDepth: size.colorDepth ?? hub75.colorDepth,
						scanLines: size.scanLines ?? hub75.scanLines
					}
				};
				if (!config.planeDurations && hub75.basePulse) {
					const planes = config.size.colorDepth;
					const base = hub75.basePulse;
					const durations = new Array(planes);
					for (let i = 0; i < planes; i++)
						durations[i] = base << i;
					config.planeDurations = durations;
				}
				return new Hub75(config);
			}
		}
	}
};

export default Object.freeze(device, true);
