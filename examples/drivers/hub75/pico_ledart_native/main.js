import Timer from "timer";

const hub75Peripheral = device?.peripheral?.Hub75;

if (!hub75Peripheral)
	throw new Error("Hub75 peripheral is unavailable on this target");

const controller = new hub75Peripheral();

const WIDTH = 64;
const HEIGHT = 32;

controller.configure({
	size: {
		width: WIDTH,
		height: HEIGHT,
		colorDepth: 6
	}
});

function makeFrame(color565) {
	const frame = new Uint16Array(WIDTH * HEIGHT);
	frame.fill(color565);
	return frame;
}

const redFrame = makeFrame(0xF800);
const greenFrame = makeFrame(0x07E0);

controller.start(redFrame.buffer);

let toggle = 0;
Timer.repeat(() => {
	controller.swapBuffers(toggle ? redFrame.buffer : greenFrame.buffer);
	toggle ^= 1;
}, 1000);

trace("Hub75 native controller initialized\n");
