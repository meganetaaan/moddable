/*
 * Copyright (c) 2021-2025  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 * 
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

import Session from "ssl/session";
import Timer from "timer";

function traceTLS419(enabled, message) {
	if (!enabled)
		return;
	trace(`zclaw tls419 ${message}\n`);
}

function traceTLS419Error(enabled, owner, error) {
	traceTLS419(enabled, `${owner} error=${error}`);
	if (enabled && error?.stack)
		trace(`${error.stack}\n`);
}

class TLSSocket {
	#socket;
	#ready = false;
	#session;
	#callbacks;
	#data;
	#format = true;		// true == buffer, false = number
	#doRead;
	#traceNetwork = false;

/*
	host (TLS server name indication extension)
	ALPNProtocols
	enableTrace
	minVersion - 'TLSv1.3', 'TLSv1.2', 'TLSv1.1', or 'TLSv1'
	macVersion - same (IGNORE?)
	ca: [PEM!!]
	certificate: [DER!],
	clientKey
	clientCertificates
 */

	constructor(options) {		
		this.#traceNetwork = options.traceNetwork === true;
		traceTLS419(this.#traceNetwork, `construct host=${options.host} port=${options.port ?? 443}`);
		this.#callbacks = {
			onReadable: options.onReadable,
			onWritable: options.onWritable,
			onError: options.onError
		}; 

		try {
			this.#session = new Session({
				serverName: options.host,		// serverName for SNI. This defaults it to host. Caller can override with options.secure.serverName
				...options.secure,
				protocolVersion: 0x303,
			});
			this.#session.initiateHandshake();
			traceTLS419(this.#traceNetwork, `session_ready host=${options.host}`);
		}
		catch (error) {
			traceTLS419Error(this.#traceNetwork, `session host=${options.host}`, error);
			throw error;
		}

		this.#socket = new options.TCP.io({
			...options,
			onReadable: count => this.#onReadable(count),
			onWritable: count => this.#onWritable(count),
			onError: () => this.#onError()
		});
		this.#socket.readable =
		this.#socket.writable = 0;
	}
	close() {
		this.#socket?.close();
		Timer.clear(this.#doRead);

		this.#socket =
		this.#session = 
		this.#doRead = undefined;
	}
	read(count) {
		const data = this.#data;
		if (!data)
			return;

		let result;
		if (this.#format) {
			if (undefined !== count) {
				const available = data.byteLength - data.position;
				if ("object" === typeof count) {
					result = count.byteLength;
					if (result > available)
						result = available;

					const buffer = ArrayBuffer.isView(count) ? new Uint8Array(count.buffer, count.byteOffset, result) : new Uint8Array(count.buffer);
					buffer.set(data.subarray(data.position, data.position + result)); 
					data.position += result;
				}
				else {
					if (count > available)
						throw new Error("invalid")
					result = data.slice(data.position, data.position + count).buffer;
					data.position += count;
				}
				if (data.position === data.byteLength)
					this.#data = undefined;
			}
			else {	// could optimize when entire buffer is requested
				result = data.slice(data.position, data.position + data.byteLength).buffer;
				this.#data = undefined;
			}
		}
		else {
			result = data[data.position++];
			if (data.position === data.byteLength)
				this.#data = undefined;
		}

		if (!this.#data && this.#socket.readable) {
			this.#doRead ??= Timer.set(() => {
				this.#doRead = undefined;
				if (this.#socket.readable)
					this.#onReadable(this.#socket.readable);
			});
		}

		return result;
	}
	write(buffer, options) {
		if (buffer instanceof DataView)
			buffer = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		return this.#session.write(this.#socket, buffer, options);
	}
	set format(format) {
		if (("buffer" != format) && ("number" != format))
			throw new RangeError;
		this.#format = format == "buffer";
	}
	get format() {
		return this.#format ? "buffer" : "number";
	}
	#onWritable(count) {
		try {
			traceTLS419(this.#traceNetwork, `writable count=${count} ready=${this.#ready ? "yes" : "no"}`);
			this.#socket.writable = count;
			if (!this.#ready)
				this.#messageHandler();
			else if (count > 96)			// 96 is an estimate of TLS overhead
				this.#callbacks.onWritable?.(count - 96);
		}
		catch (error) {
			traceTLS419Error(this.#traceNetwork, "onWritable", error);
			this.#onError();
		}
	}
	#onReadable(count) {
		try {
			traceTLS419(this.#traceNetwork, `readable count=${count} ready=${this.#ready ? "yes" : "no"}`);
			this.#socket.readable = count;
			if (this.#data)
				return;

			this.#messageHandler(true);
			if (!this.#ready)
				this.#messageHandler();
		}
		catch (error) {
			traceTLS419Error(this.#traceNetwork, "onReadable", error);
			this.#onError();
		}
	}
	#onError() {
		traceTLS419(this.#traceNetwork, "error");
		this.#callbacks.onError?.();
	}
	#messageHandler(read) {
		try {
			if (!this.#ready) {
				if (this.#session.handshake(this.#socket)) {
					this.#ready = true;
					traceTLS419(this.#traceNetwork, "handshake_complete");
					this.#onWritable(this.#socket.writable);
				}
				if (read)
					this.#session.read(this.#socket);
				return;
			}

			const data = this.#session.read(this.#socket);
			if (undefined === data)		// nothing to read
				return;
			if (null === data)		// closed
				return void this.#onError();
			data.position = 0;
			const readable = data.byteLength;
			if (!readable)
				return;
			this.#data = data;

			this.#callbacks.onReadable?.(readable);
		}
		catch (error) {
			traceTLS419Error(this.#traceNetwork, "messageHandler", error);
			throw error;
		}
	}
}

export default TLSSocket;
