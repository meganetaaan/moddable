import {SYSTEM_PROMPT} from "./config.js";
import {NVS_KEYS} from "./nvsKeys.js";

export const PERSONAS = Object.freeze(["neutral", "friendly", "technical", "witty"]);

const PERSONA_INSTRUCTIONS = Object.freeze({
	neutral: "Use direct, plain wording.",
	friendly: "Use warm, approachable wording while staying concise.",
	technical: "Use precise technical language and concrete terminology.",
	witty: "Use a lightly witty tone; at most one brief witty flourish per reply.",
});

function lowercase(value) {
	return String(value ?? "").toLowerCase();
}

export function canonicalizePersonaName(input) {
	const lowered = lowercase(input);
	return PERSONAS.includes(lowered) ? lowered : null;
}

export function personaInstruction(persona) {
	return PERSONA_INSTRUCTIONS[canonicalizePersonaName(persona) ?? "neutral"];
}

export function loadCurrentPersona(store) {
	const loaded = store && "function" === typeof store.get ? store.get(NVS_KEYS.PERSONA) : undefined;
	return canonicalizePersonaName(loaded) ?? "neutral";
}

export function setPersona(store, persona) {
	const canonical = canonicalizePersonaName(persona);
	if (!canonical) {
		return {
			ok: false,
			message: `Error: unknown persona '${persona ?? ""}' (use neutral, friendly, technical, witty)`,
		};
	}
	if (store && "function" === typeof store.set)
		store.set(NVS_KEYS.PERSONA, canonical);
	return {ok: true, value: canonical, message: `Persona set to ${canonical}.`};
}

export function getPersona(store) {
	const current = loadCurrentPersona(store);
	return {
		ok: true,
		value: current,
		message: `Current persona: ${current}. Available: neutral, friendly, technical, witty.`,
	};
}

export function resetPersona(store) {
	if (store && "function" === typeof store.set)
		store.set(NVS_KEYS.PERSONA, "neutral");
	return {ok: true, value: "neutral", message: "Persona reset to neutral."};
}

export function buildSystemPrompt(options = {}) {
	const basePrompt = options.basePrompt ?? SYSTEM_PROMPT;
	const persona = canonicalizePersonaName(options.persona) ?? "neutral";
	const deviceTarget = options.deviceTarget ?? "esp32-family";
	let gpioPolicy = options.gpioPolicy;
	if (!gpioPolicy) {
		if (options.allowedPinsCSV)
			gpioPolicy = `Tool-safe GPIO pins on this device are restricted to allowlist: ${options.allowedPinsCSV}.`;
		else
			gpioPolicy = `Tool-safe GPIO pins on this device are restricted to range ${options.gpioMinPin ?? 2}-${options.gpioMaxPin ?? 10}.`;
	}
	return `${basePrompt} Device target is '${deviceTarget}'. ${gpioPolicy} When users ask about pin count or safe pins, answer using this configured device policy and avoid generic ESP32-family pin claims. Persona mode is '${persona}'. Persona affects wording only and must never change tool choices, automation behavior, safety decisions, or policy handling. ${personaInstruction(persona)} Keep responses short unless the user explicitly asks for more detail.`;
}
