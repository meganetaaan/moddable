/*
 * Copyright (c) 2024-2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 *
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Application-issued credentials for a trusted Live signaling broker.
// These are not OpenAI Realtime client secrets.
export default class Broker {
	#url;
	#deviceToken;
	#certificate;
	#platform;
	#control;
	constructor(options, platform) {
		if (!options || typeof options.url !== "string" || !/^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(options.url.replace(/\/$/, "")))
			throw new TypeError("broker.url must be an HTTPS origin");
		if (typeof options.deviceToken !== "string" || options.deviceToken.length < 32 || /[\r\n]/.test(options.deviceToken))
			throw new TypeError("broker.deviceToken must contain at least 32 characters");
		this.#url = options.url.replace(/\/$/, ""); this.#deviceToken = options.deviceToken;
		this.#certificate = options.certificate; this.#platform = platform;
	}
	#post(path, token, body) {
		return this.#platform.fetch(this.#url + path, {method: "POST", certificate: this.#certificate,
			headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"}, body});
	}
	async create(sdp, canStart, starting) {
		let response = await this.#post("/token", this.#deviceToken, "{}");
		const text = await response.text();
		if (response.status !== 200) throw new Error(`Broker token request failed (HTTP ${response.status})`);
		let token;
		try { token = JSON.parse(text); } catch { throw new Error("Invalid broker token response"); }
		if (!token || typeof token.value !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(token.value) ||
			!Number.isFinite(token.expires_at) || token.expires_at * 1000 <= (this.#platform.now?.() ?? Date.now()))
			throw new Error("Invalid or expired broker token");
		if (!canStart()) return;
		starting();
		response = await this.#post("/sessions", token.value, JSON.stringify({transport: {type: "webrtc", sdp}}));
		return response;
	}
	accept(result) {
		const token = result.broker?.control_token;
		if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(token))
			throw new Error("Missing broker session control token");
		this.#control = {id: result.session.id, token};
	}
	async hangup(id) {
		if (this.#control?.id !== id) throw new Error("No broker control credential for session");
		const response = await this.#post(`/sessions/${encodeURIComponent(id)}/hangup`, this.#control.token, "");
		await response.text();
		if (!response.ok) throw new Error(`Broker hangup failed (HTTP ${response.status})`);
		this.#control = undefined;
	}
}
