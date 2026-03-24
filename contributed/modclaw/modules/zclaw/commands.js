function isWhitespaceChar(char) {
	return (" " === char) || ("\t" === char) || ("\r" === char) || ("\n" === char);
}

function normalizeCommandInput(message) {
	let text = String(message ?? "");
	while (text.length && isWhitespaceChar(text[0]))
		text = text.slice(1);
	return text;
}

function isDiagScopeToken(token) {
	return ["quick", "runtime", "memory", "rates", "time", "all"].includes(token);
}

function parseGPIOStateToken(token) {
	if (["1", "high", "on"].includes(token))
		return 1;
	if (["0", "low", "off"].includes(token))
		return 0;
	throw new Error(`Error: unknown GPIO state '${token}' (use high/low/on/off/1/0)`);
}

export function isCommand(message, name) {
	if (!message || !name)
		return false;

	const text = normalizeCommandInput(message);
	if (!text.startsWith("/"))
		return false;

	const body = text.slice(1);
	if (!body.startsWith(name))
		return false;

	const next = body[name.length];
	if ((undefined === next) || isWhitespaceChar(next))
		return true;
	if ("@" !== next)
		return false;

	const remainder = body.slice(name.length + 1);
	if (!remainder.length)
		return false;

	let i = 0;
	while ((i < remainder.length) && !isWhitespaceChar(remainder[i]))
		i++;
	return i > 0;
}

export function commandPayload(message, name) {
	if (!isCommand(message, name))
		return null;

	let text = normalizeCommandInput(message).slice(1 + name.length);
	if (text.startsWith("@")) {
		text = text.slice(1);
		while (text.length && !isWhitespaceChar(text[0]))
			text = text.slice(1);
	}
	while (text.length && isWhitespaceChar(text[0]))
		text = text.slice(1);
	return text;
}

export function isSlashCommand(message) {
	return normalizeCommandInput(message).startsWith("/");
}

export function parseGPIOCommandArgs(message) {
	const payload = commandPayload(message, "gpio");
	if (null === payload)
		throw new Error("Error: not a /gpio command");
	if (!payload.length)
		return {toolName: "gpio_read_all", input: {}};
	if (payload.length >= 64)
		throw new Error("Error: /gpio arguments too long");

	const parts = payload.split(/\s+/).filter(Boolean);
	if ("all" === parts[0]) {
		if (parts.length > 1)
			throw new Error("Error: /gpio all does not take extra arguments");
		return {toolName: "gpio_read_all", input: {}};
	}

	const pin = Number(parts[0]);
	if (!Number.isInteger(pin))
		throw new Error(`Error: unknown /gpio argument '${parts[0]}' (use 'all' or a pin number)`);

	if (1 === parts.length)
		return {toolName: "gpio_read", input: {pin}};
	if (parts.length > 2)
		throw new Error("Error: /gpio takes at most a pin and optional state");

	return {toolName: "gpio_write", input: {pin, state: parseGPIOStateToken(parts[1].toLowerCase())}};
}

export function parseDiagCommandArgs(message) {
	const payload = commandPayload(message, "diag");
	if (null === payload)
		throw new Error("Error: not a /diag command");
	if (!payload.length)
		return {};
	if (payload.length >= 128)
		throw new Error("Error: /diag arguments too long");

	const parts = payload.split(/\s+/).filter(Boolean);
	const input = {};
	for (const raw of parts) {
		const token = raw.toLowerCase();
		if (("verbose" === token) || ("--verbose" === token))
			input.verbose = true;
		else if (!input.scope && isDiagScopeToken(token))
			input.scope = token;
		else
			throw new Error(`Error: unknown /diag argument '${raw}' (use scope + optional verbose)`);
	}
	return input;
}
