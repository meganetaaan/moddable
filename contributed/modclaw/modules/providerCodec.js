import {
	buildRequest,
	parseResponse,
	resolveBackendConfig,
} from "./providers.js";

export function createProviderCodec(options = {}) {
	const config = resolveBackendConfig(options);
	return Object.freeze({
		config,
		buildRequest({systemPrompt, history, tools, userMessage = ""}) {
			return buildRequest({
				backend: config.backend,
				model: config.model,
				apiUrlOverride: config.apiUrl,
				systemPrompt,
				history,
				userMessage,
				tools,
			});
		},
		parseResponse(responseText) {
			return parseResponse({
				backend: config.backend,
				responseText,
			});
		},
	});
}
