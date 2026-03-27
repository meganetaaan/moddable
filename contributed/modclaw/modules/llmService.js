import {buildLLMBearerAuthHeader} from "../core/llmAuth.js";
import {NVS_KEYS, LLM_BACKENDS} from "./config.js";
import {isDebugTraceEnabled} from "./debug.js";
import {resolveBackendConfig} from "./providers.js";

const OPENROUTER_REFERER = "https://github.com/tnm/zclaw";
const OPENROUTER_TITLE = "zclaw";
const ANTHROPIC_VERSION = "2023-06-01";

function traceLLM(message, force = false) {
	if (!force && !isDebugTraceEnabled("llm"))
		return;
	trace(`zclaw llm ${message}\n`);
}

function backendRequiresApiKey(backend) {
	return backend !== LLM_BACKENDS.OLLAMA;
}

function appendHeader(headers, name, value) {
	if (!value)
		return;
	headers.push(name, value);
}

function buildHeaders(config) {
	const headers = ["Content-Type", "application/json"];

	if (config.backend === LLM_BACKENDS.ANTHROPIC) {
		appendHeader(headers, "x-api-key", config.apiKey);
		appendHeader(headers, "anthropic-version", ANTHROPIC_VERSION);
		return headers;
	}

	if (config.apiKey) {
		const authHeader = buildLLMBearerAuthHeader(config.apiKey);
		if (authHeader)
			appendHeader(headers, "Authorization", authHeader);
	}

	if (config.backend === LLM_BACKENDS.OPENROUTER) {
		appendHeader(headers, "HTTP-Referer", OPENROUTER_REFERER);
		appendHeader(headers, "X-Title", OPENROUTER_TITLE);
	}

	return headers;
}

function normalizeTransportResponse(response) {
	if (!response)
		return {ok: false, text: ""};
	if ("string" === typeof response)
		return {ok: true, text: response};
	return {
		ok: response.ok === true,
		text: response.text ?? "",
		status: response.status ?? 0,
	};
}

export class LLMService {
	constructor(options = {}) {
		this.store = options.store ?? null;
		this.transport = options.transport ?? null;
		this.httpGate = options.httpGate ?? null;
		this.overrides = options.overrides ?? {};
		this.config = null;
	}

	init() {
		this.config = resolveBackendConfig({
			backend: this.overrides.backend ?? this.store?.get?.(NVS_KEYS.LLM_BACKEND),
			model: this.overrides.model ?? this.store?.get?.(NVS_KEYS.LLM_MODEL),
			apiKey: this.overrides.apiKey ?? this.store?.get?.(NVS_KEYS.API_KEY) ?? null,
			apiUrlOverride: this.overrides.apiUrlOverride ?? this.store?.get?.(NVS_KEYS.LLM_API_URL) ?? null,
		});
		return this.config;
	}

	#config() {
		return this.config ?? this.init();
	}

	getBackend() {
		return this.#config().backend;
	}

	getModel() {
		return this.#config().model;
	}

	getApiUrl() {
		return this.#config().apiUrl;
	}

	isOpenAIFormat() {
		return this.#config().usesOpenAIFormat;
	}

	async request(requestBody) {
		if (("string" !== typeof requestBody) || !requestBody.length)
			return {ok: false, responseText: ""};

		const config = this.#config();
		if (backendRequiresApiKey(config.backend) && !config.apiKey)
			return {ok: false, responseText: ""};
		if (!this.transport?.requestText)
			return {ok: false, responseText: ""};

		traceLLM(`request backend=${config.backend} model=${config.model} url=${config.apiUrl}`);

		const perform = async () => normalizeTransportResponse(await this.transport.requestText({
			url: config.apiUrl,
			method: "POST",
			headers: buildHeaders(config),
			body: requestBody,
			secure: {
				applicationLayerProtocolNegotiation: "http/1.1",
			},
		}));

		const result = this.httpGate
			? await this.httpGate.runExclusive("llm", {}, perform)
			: {ok: true, skipped: false, value: await perform()};
		const response = result.value ?? {ok: false, text: ""};
		const preview = String(response.text ?? "").slice(0, 160).replace(/\s+/g, " ");
		traceLLM(
			`response backend=${config.backend} ok=${response.ok === true ? "yes" : "no"} ` +
			`status=${response.status ?? 0} body=${preview}`,
			response.ok !== true
		);

		return {
			ok: response.ok === true,
			responseText: response.text ?? "",
		};
	}
}
