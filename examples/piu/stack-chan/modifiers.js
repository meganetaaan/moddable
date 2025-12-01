// Blink / Breath / Saccade modifiers (allocation-minimal)

function randomBetween(min, max) {
	return min + Math.random() * (max - min);
}

function normRand(mean, stddev) {
	// Box-Muller, single sample
	const u = 1 - Math.random();
	const v = 1 - Math.random();
	return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function linearInEaseOut(fraction) {
	if (fraction < 0.25) return 1 - fraction * 4;
	return ((fraction - 0.25) ** 2 * 16) / 9;
}

export function createBlinkModifier({ openMin, openMax, closeMin, closeMax }) {
	let isBlinking = false;
	let nextToggle = randomBetween(openMin, openMax);
	let count = 0;
	return (tickMillis, face) => {
		let eyeOpen = 1;
		if (isBlinking) {
			const fraction = linearInEaseOut(count / nextToggle);
			eyeOpen = 0.2 + fraction * 0.8;
		}
		count += tickMillis;
		if (count >= nextToggle) {
			isBlinking = !isBlinking;
			count = 0;
			nextToggle = isBlinking ? randomBetween(closeMin, closeMax) : randomBetween(openMin, openMax);
		}
		const eyes = face.eyes;
		eyes.left.open *= eyeOpen;
		eyes.right.open *= eyeOpen;
	};
}

export function createSaccadeModifier({ updateMin, updateMax, gain }) {
	let nextToggle = randomBetween(updateMin, updateMax);
	let saccadeX = 0;
	let saccadeY = 0;
	return (tickMillis, face) => {
		nextToggle -= tickMillis;
		if (nextToggle < 0) {
			saccadeX = normRand(0, gain);
			saccadeY = normRand(0, gain);
			nextToggle = randomBetween(updateMin, updateMax);
		}
		const eyes = face.eyes;
		eyes.left.gazeX += saccadeX;
		eyes.left.gazeY += saccadeY;
		eyes.right.gazeX += saccadeX;
		eyes.right.gazeY += saccadeY;
	};
}

export function createBreathModifier({ duration }) {
	let time = 0;
	return (tickMillis, face) => {
		time = (time + tickMillis) % duration;
		face.breath = Math.sin((2 * Math.PI * time) / duration);
	};
}
