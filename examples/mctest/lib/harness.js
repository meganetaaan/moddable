const protocol = "mctest/1";
const tests = [];

function writeLine(line) {
	if ((typeof $262 !== "undefined") && (typeof print === "function"))
		print(line);
	else if (typeof trace === "function")
		trace(line + "\n");
	else if (typeof print === "function")
		print(line);
	else
		throw new Error("mctest requires trace or print");
}

function now() {
	return Date.now ? Date.now() : new Date().getTime();
}

function errorRecord(error) {
	if (error && typeof error === "object") {
		return {
			name: String(error.name || "Error"),
			message: String(error.message || error),
			stack: error.stack ? String(error.stack) : undefined,
		};
	}
	return {
		name: "Error",
		message: String(error),
	};
}

export function emit(type, data = {}) {
	writeLine(JSON.stringify({
		protocol,
		type,
		...data,
	}));
}

export function test(name, fn) {
	tests.push({ name, fn });
}

export function skip(name, reason = "skipped") {
	tests.push({ name, skip: true, reason });
}

export function expect(actual) {
	return {
		toBe(expected) {
			if (actual !== expected)
				throw new Error(`expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
		},
		toEqual(expected) {
			const a = JSON.stringify(actual);
			const b = JSON.stringify(expected);
			if (a !== b)
				throw new Error(`expected ${a} to equal ${b}`);
		},
		toBeTruthy() {
			if (!actual)
				throw new Error(`expected ${JSON.stringify(actual)} to be truthy`);
		},
		toBeGreaterThan(expected) {
			if (!(actual > expected))
				throw new Error(`expected ${JSON.stringify(actual)} to be greater than ${JSON.stringify(expected)}`);
		},
		toMatch(pattern) {
			const regexp = pattern instanceof RegExp ? pattern : new RegExp(pattern);
			if (!regexp.test(String(actual)))
				throw new Error(`expected ${JSON.stringify(actual)} to match ${regexp}`);
		},
	};
}

export async function run(options = {}) {
	const name = options.name || "mctest";
	const start = now();
	let passed = 0;
	let failed = 0;
	let skipped = 0;

	emit("run:start", { name, count: tests.length });
	for (const record of tests) {
		const testStart = now();
		emit("test:start", { name: record.name });
		if (record.skip) {
			skipped++;
			emit("test:skip", { name: record.name, reason: record.reason, durationMs: now() - testStart });
			continue;
		}
		try {
			await record.fn({ emit, expect });
			passed++;
			emit("test:pass", { name: record.name, durationMs: now() - testStart });
		}
		catch (error) {
			failed++;
			emit("test:fail", { name: record.name, error: errorRecord(error), durationMs: now() - testStart });
		}
	}
	emit("run:done", {
		name,
		passed,
		failed,
		skipped,
		durationMs: now() - start,
	});
}

export function reset() {
	tests.length = 0;
}
