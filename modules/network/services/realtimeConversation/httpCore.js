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

/* One HTTPS connection per request. The SDK's compact fetch keeps global
 * clients and does not reject its body promise on every socket failure.
 * Signaling instead needs a bounded body, a deadline, and deterministic close.
 * This deliberately implements only the two Live POST endpoints. */
export default function liveFetch(url, options, platform) {
	const origin = "https://api.openai.com";
	if (!url.startsWith(`${origin}/v1/live/sessions`) || options.method !== "POST")
		return Promise.reject(new URIError("Invalid Live endpoint"));
	return new Promise((resolve, reject) => {
		let client, timer, finished = false, body, buffer, offset = 0, status;
		function finish(error) {
			if (finished) return;
			finished = true;
			if (timer) platform.clearTimeout(timer);
			try { client?.close(); } catch {}
			client = undefined;
			body = undefined;
			if (error) { buffer = undefined; reject(error); }
			else {
				const result = buffer ?? new ArrayBuffer;
				buffer = undefined;
				resolve({status, ok: status >= 200 && status < 300, text: async () => platform.decode(result)});
			}
		}
		try {
			body = platform.encode(options.body);
			const headers = new Map(Object.entries(options.headers).map(([name, value]) => [name.toLowerCase(), value]));
			headers.set("content-length", String(body.byteLength));
			headers.set("connection", "close");
			timer = platform.setTimeout(() => finish(new Error("Live HTTPS request timed out")), 45000);
			client = platform.createClient({host: "api.openai.com", port: 443,
				onError() { finish(new Error("Live HTTPS connection failed")); }});
			client.request({
				method: "POST", path: url.slice(origin.length), headers,
				onHeaders(code, responseHeaders) {
					status = code;
					if (Number(responseHeaders.get("content-length")) > 131072)
						finish(new Error("Live HTTPS response exceeds limit"));
				},
				onWritable(count) {
					if (finished) return;
					try {
						count = Math.min(count, body.byteLength - offset);
						if (count) { this.write(new DataView(body, offset, count)); offset += count; }
						else this.write();
					}
					catch { finish(new Error("Live HTTPS write failed")); }
				},
				onReadable(count) {
					if (finished || !count) return;
					try {
						if ((buffer?.byteLength ?? 0) + count > 131072) throw new Error;
						const chunk = this.read(count);
						buffer = buffer ? buffer.concat(chunk) : chunk;
					}
					catch { finish(new Error("Live HTTPS response could not be read within limit")); }
				},
				onDone(error) { finish(error ? new Error("Live HTTPS request failed") : undefined); }
			});
		}
		catch { finish(new Error("Live HTTPS initialization failed")); }
	});
}
