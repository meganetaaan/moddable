/*---
description:
flags: [module, async]
---*/

import {HttpGate} from "../../../contributed/modclaw/modules/httpGate.js";
import {LLMService} from "../../../contributed/modclaw/modules/llmService.js";
import {NVS_KEYS} from "../../../contributed/modclaw/modules/config.js";

class FakeTransport {
	constructor() {
		this.requests = [];
		this.responses = [];
	}

	push(response) {
		this.responses.push(response);
	}

	async requestText(request) {
		this.requests.push(request);
		return this.responses.shift() ?? {ok: false, text: ""};
	}
}

let store = new Map([
	[NVS_KEYS.API_KEY, "sk-openai"],
]);
let transport = new FakeTransport;
transport.push({ok: true, text: "{\"ok\":true}"});
let service = new LLMService({store, transport});
assert.sameValue(service.init().backend, "openai");
let response = await service.request("{\"ping\":1}");
assert.sameValue(response.ok, true);
assert.sameValue(response.responseText, "{\"ok\":true}");
assert.sameValue(transport.requests[0].url, "https://api.openai.com/v1/chat/completions");
assert.sameValue(transport.requests[0].headers[0], "Content-Type");
assert.sameValue(transport.requests[0].headers[2], "Authorization");
assert.sameValue(transport.requests[0].headers[3], "Bearer sk-openai");
assert.sameValue(transport.requests[0].secure.applicationLayerProtocolNegotiation, "http/1.1");

store = new Map([
	[NVS_KEYS.LLM_BACKEND, "anthropic"],
	[NVS_KEYS.API_KEY, "sk-anthropic"],
]);
transport = new FakeTransport;
transport.push({ok: true, text: "{\"content\":[]}"});
service = new LLMService({store, transport});
await service.request("{\"hello\":true}");
assert.sameValue(transport.requests[0].headers.includes("x-api-key"), true);
assert.sameValue(transport.requests[0].headers.includes("anthropic-version"), true);

store = new Map([
	[NVS_KEYS.LLM_BACKEND, "openrouter"],
	[NVS_KEYS.API_KEY, "sk-router"],
]);
transport = new FakeTransport;
transport.push({ok: true, text: "{}"});
service = new LLMService({store, transport});
await service.request("{\"hello\":true}");
assert.sameValue(transport.requests[0].headers.includes("HTTP-Referer"), true);
assert.sameValue(transport.requests[0].headers.includes("X-Title"), true);

store = new Map([
	[NVS_KEYS.LLM_BACKEND, "ollama"],
]);
transport = new FakeTransport;
transport.push({ok: true, text: "{\"choices\":[]}"});
service = new LLMService({store, transport, httpGate: new HttpGate});
response = await service.request("{\"hello\":true}");
assert.sameValue(response.ok, true);
assert.sameValue(service.getApiUrl(), "http://127.0.0.1:11434/v1/chat/completions");
assert.sameValue(transport.requests[0].headers.includes("Authorization"), false);
assert.sameValue(transport.requests[0].secure.applicationLayerProtocolNegotiation, "http/1.1");
