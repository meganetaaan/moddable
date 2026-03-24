import {NVS_KEYS} from "./config.js";
import {canonicalizePersonaName} from "../core/persona.js";

function requireStorage(storage) {
	if (!storage || ("function" !== typeof storage.read) || ("function" !== typeof storage.write))
		throw new TypeError("storage must implement read(key) and write(key, value)");
}

export {canonicalizePersonaName};

export function loadPersona(storage, key = NVS_KEYS.PERSONA) {
	requireStorage(storage);
	return canonicalizePersonaName(storage.read(key)) ?? "neutral";
}

export function setPersona(storage, value, key = NVS_KEYS.PERSONA) {
	requireStorage(storage);
	const canonical = canonicalizePersonaName(value);
	if (!canonical)
		throw new RangeError(`unknown persona '${value}'`);
	storage.write(key, canonical);
	return canonical;
}

export function resetPersona(storage, key = NVS_KEYS.PERSONA) {
	requireStorage(storage);
	storage.write(key, "neutral");
	return "neutral";
}
