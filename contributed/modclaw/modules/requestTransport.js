import {Request} from "http";
import SecureSocket from "securesocket";

function flattenHeaders(headers) {
	if (!headers)
		return undefined;

	if (Array.isArray(headers))
		return headers.slice();

	if ("function" === typeof headers.entries) {
		const flattened = [];
		for (const [name, value] of headers.entries()) {
			flattened.push(name, value);
		}
		return flattened;
	}

	const flattened = [];
	for (const [name, value] of Object.entries(headers))
		flattened.push(name, value);
	return flattened;
}

function parseURL(url) {
	const match = /^([A-Za-z]+):\/\/([^\/:?#]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?$/.exec(String(url ?? ""));
	if (!match)
		throw new Error(`Invalid URL: ${url}`);

	const scheme = match[1].toLowerCase();
	const host = match[2];
	const port = match[3] ? Number(match[3]) : ("https" === scheme ? 443 : 80);
	const path = `${match[4] ?? "/"}${match[5] ?? ""}`;
	return {scheme, host, port, path};
}

export class RequestTransport {
	constructor(options = {}) {
		this.Request = options.Request ?? Request;
		this.SecureSocket = options.SecureSocket ?? SecureSocket;
	}

	requestText(options = {}) {
		const {scheme, host, port, path} = parseURL(options.url);
		const RequestClass = this.Request;

		return new Promise(resolve => {
			let status = 0;
			const request = new RequestClass({
				host,
				port,
				path,
				method: options.method ?? "GET",
				headers: flattenHeaders(options.headers),
				body: options.body,
				response: String,
				...("https" === scheme ? {
					Socket: this.SecureSocket,
					secure: {protocolVersion: 0x303},
				} : {}),
			});

			request.callback = function(message, value) {
				if (message === RequestClass.status) {
					status = value;
					return;
				}

				if (message === RequestClass.responseComplete) {
					request.close?.();
					resolve({
						ok: status >= 200 && status < 300,
						status,
						text: "string" === typeof value ? value : "",
					});
					return;
				}

				if (message < 0) {
					request.close?.();
					resolve({ok: false, status, text: ""});
				}
			};
		});
	}
}
