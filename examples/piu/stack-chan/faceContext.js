// FaceContext utilities: single source of truth, allocation-minimal.

export const defaultFaceContext = Object.freeze({
	mouth: { open: 0 },
	eyes: {
		left: { open: 1, gazeX: 0, gazeY: 0 },
		right: { open: 1, gazeX: 0, gazeY: 0 },
	},
	breath: 1,
	emotion: "NEUTRAL",
	theme: {
		primary: [0xff, 0xff, 0xff],
		secondary: [0x00, 0x00, 0x00],
	},
});

export function createFaceContext() {
	const ctx = {
		mouth: { open: 0 },
		eyes: {
			left: { open: 1, gazeX: 0, gazeY: 0 },
			right: { open: 1, gazeX: 0, gazeY: 0 },
		},
		breath: 1,
		emotion: "NEUTRAL",
		theme: { primary: [0xff, 0xff, 0xff], secondary: [0x00, 0x00, 0x00] },
	};
	return ctx;
}

export function copyFaceContext(src, dst) {
	dst.mouth.open = src.mouth.open;

	dst.eyes.left.open = src.eyes.left.open;
	dst.eyes.left.gazeX = src.eyes.left.gazeX;
	dst.eyes.left.gazeY = src.eyes.left.gazeY;

	dst.eyes.right.open = src.eyes.right.open;
	dst.eyes.right.gazeX = src.eyes.right.gazeX;
	dst.eyes.right.gazeY = src.eyes.right.gazeY;

	dst.breath = src.breath;
	dst.emotion = src.emotion;

	const p = src.theme.primary, pd = dst.theme.primary;
	pd[0] = p[0]; pd[1] = p[1]; pd[2] = p[2];
	const s = src.theme.secondary, sd = dst.theme.secondary;
	sd[0] = s[0]; sd[1] = s[1]; sd[2] = s[2];
}

export function toColorString(rgb) {
	return `#${rgb[0].toString(16).padStart(2, "0")}${rgb[1].toString(16).padStart(2, "0")}${rgb[2]
		.toString(16)
		.padStart(2, "0")}`;
}
