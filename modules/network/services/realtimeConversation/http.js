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

import Timer from "timer";
import request from "realtimeConversation/httpCore";

export default function liveFetch(url, options) {
	return request(url, options, {
		createClient: ({certificate, ...options}) => new device.network.https.io({...device.network.https, ...options,
			socket: {...device.network.https.socket, tls: {...device.network.https.socket.tls, ca: certificate}}}),
		setTimeout: (callback, delay) => Timer.set(callback, delay),
		clearTimeout: timer => Timer.clear(timer),
		encode: text => ArrayBuffer.fromString(text),
		decode: buffer => String.fromArrayBuffer(buffer)
	});
}
