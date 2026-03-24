function fail(message) {
	throw new Error(message);
}

function isSameValue(left, right) {
	if (left === right)
		return (0 !== left) || ((1 / left) === (1 / right));
	return Number.isNaN(left) && Number.isNaN(right);
}

function assert(value, message = "assertion failed") {
	if (!value)
		fail(message);
}

assert.sameValue = function(left, right, message = `Expected ${left} to equal ${right}`) {
	if (!isSameValue(left, right))
		fail(message);
};

assert.throws = function(ExpectedError, callback, message = "Expected function to throw") {
	let thrown = false;
	try {
		callback();
	}
	catch (error) {
		thrown = true;
		if (ExpectedError && !(error instanceof ExpectedError))
			fail(`${message}: ${error}`);
	}
	if (!thrown)
		fail(message);
};

globalThis.assert = assert;
