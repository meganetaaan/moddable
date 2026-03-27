function getDebugConfig() {
	return globalThis.__zclawDebug ?? null;
}

export function isDebugTraceEnabled(scope) {
	const debug = getDebugConfig();
	if (true === debug)
		return true;
	if (!debug)
		return false;
	if (Array.isArray(debug))
		return debug.includes("*") || debug.includes(scope);
	if ("object" === typeof debug)
		return Boolean(debug.all || debug[scope]);
	return false;
}

export function traceDebug(scope, message) {
	if (!isDebugTraceEnabled(scope))
		return;
	trace(`zclaw ${scope} ${message}\n`);
}

export function traceDebugError(scope, owner, error) {
	if (!isDebugTraceEnabled(scope))
		return;
	traceDebug(scope, `${owner} error=${error}`);
	if (error?.stack)
		trace(`${error.stack}\n`);
}
