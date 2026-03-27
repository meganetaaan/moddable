function traceTransport(message) {
	trace(`zclaw transport ${message}\n`);
}

function traceTransportError(owner, error) {
	traceTransport(`${owner} error=${error}`);
	if (error?.stack)
		trace(`${error.stack}\n`);
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

function toHeaderMap(headers, bodyBuffer) {
	const map = new Map;
	if (Array.isArray(headers)) {
		for (let i = 0; i < headers.length; i += 2) {
			const name = String(headers[i] ?? "");
			if (!name)
				continue;
			map.set(name, String(headers[i + 1] ?? ""));
		}
	}
	else if (headers && ("function" === typeof headers.entries)) {
		for (const [name, value] of headers.entries()) {
			if (!name)
				continue;
			map.set(String(name), String(value ?? ""));
		}
	}
	else if (headers) {
		for (const [name, value] of Object.entries(headers)) {
			if (!name)
				continue;
			map.set(String(name), String(value ?? ""));
		}
	}

	if (bodyBuffer && !map.has("Content-Length") && !map.has("content-length"))
		map.set("Content-Length", String(bodyBuffer.byteLength));

	return map;
}

function toBodyBuffer(body) {
	if ((undefined === body) || (null === body) || ("" === body))
		return null;
	if (body instanceof ArrayBuffer)
		return body;
	if (ArrayBuffer.isView(body))
		return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
	return ArrayBuffer.fromString(String(body));
}

function appendChunk(buffer, chunk) {
	if (!chunk)
		return buffer ?? new ArrayBuffer;
	if (!buffer)
		return chunk;
	return buffer.concat(chunk);
}

function resolveNetwork(root, scheme, secureOptions) {
	const base = ("https" === scheme) ? root?.https : root?.http;
	if (!base)
		return null;
	if (("https" !== scheme) || !secureOptions)
		return base;

	return {
		...base,
		socket: {
			...(base.socket ?? {}),
			secure: {
				...(base.socket?.secure ?? {}),
				...secureOptions,
			},
		},
	};
}

export class RequestTransport {
	constructor(options = {}) {
		this.network = options.network ?? null;
	}

	requestText(options = {}) {
		const {scheme, host, port, path} = parseURL(options.url);
		const network = resolveNetwork(this.network ?? globalThis.device?.network, scheme, options.secure);
		if (!network?.io)
			return Promise.resolve({ok: false, status: 0, text: ""});

		const bodyBuffer = toBodyBuffer(options.body);
		const headers = toHeaderMap(options.headers, bodyBuffer);

		return new Promise(resolve => {
			let settled = false;
			let status = 0;
			let responseBuffer = null;
			let bodyOffset = 0;
			let client;

			const finish = result => {
				if (settled)
					return;
				settled = true;
				try {
					client?.close?.();
				}
				catch {
				}
				resolve(result);
			};

			try {
				traceTransport(`request host=${host} port=${port} path=${path}`);
				client = new network.io({
					...network,
					host,
					port,
					onError(error) {
						traceTransportError(`client_error host=${host}`, error);
						finish({ok: false, status, text: ""});
					},
				});

				client.request({
					method: options.method ?? "GET",
					path,
					headers,
					onHeaders(receivedStatus) {
						try {
							status = Number(receivedStatus) || 0;
							traceTransport(`headers host=${host} status=${status}`);
						}
						catch (error) {
							traceTransportError(`onHeaders host=${host}`, error);
							finish({ok: false, status, text: ""});
						}
					},
					onWritable(count) {
						try {
							traceTransport(`writable host=${host} count=${count}`);
							if (!bodyBuffer)
								return;

							const remaining = bodyBuffer.byteLength - bodyOffset;
							if (remaining <= 0)
								return;

							const use = Math.min(count, remaining);
							this.write(new DataView(bodyBuffer, bodyOffset, use));
							bodyOffset += use;
						}
						catch (error) {
							traceTransportError(`onWritable host=${host}`, error);
							finish({ok: false, status, text: ""});
						}
					},
					onReadable(count) {
						try {
							traceTransport(`readable host=${host} count=${count}`);
							if (count <= 0)
								return;
							responseBuffer = appendChunk(responseBuffer, this.read(count));
						}
						catch (error) {
							traceTransportError(`onReadable host=${host}`, error);
							finish({ok: false, status, text: ""});
						}
					},
					onDone(error) {
						try {
							traceTransport(`done host=${host} error=${error ? "yes" : "no"} status=${status}`);
							if (error) {
								finish({ok: false, status, text: ""});
								return;
							}
							finish({
								ok: (status >= 200) && (status < 300),
								status,
								text: String.fromArrayBuffer(responseBuffer ?? new ArrayBuffer),
							});
						}
						catch (callbackError) {
							traceTransportError(`onDone host=${host}`, callbackError);
							finish({ok: false, status, text: ""});
						}
					},
				});
			}
			catch (error) {
				traceTransportError(`exception host=${host}`, error);
				finish({
					ok: false,
					status,
					text: "",
					});
			}
		});
	}
}
