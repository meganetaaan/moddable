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

export default class Transport extends Native("xs_live_transport_destructor") {
	#timer;
	#callback;
	#closing;
	#resolveClose;
	#released = false;
	#finalStats;
	constructor(callback) {
		super();
		this.#callback = callback;
		native("xs_live_transport_constructor").call(this);
		this.#timer = Timer.repeat(() => this.#poll(), 20);
	}
	start() { native("xs_live_transport_start").call(this); }
	acceptAnswer(sdp) { native("xs_live_transport_answer").call(this, sdp); }
	send(data) { native("xs_live_transport_send").call(this, data); }
	setMuted(value) { native("xs_live_transport_mute").call(this, value); }
	setVolume(value) { native("xs_live_transport_volume").call(this, value); }
	get stats() { return this.#released ? this.#finalStats : native("xs_live_transport_stats").call(this); }
	close() {
		if (this.#closing) return this.#closing;
		if (this.#released) return Promise.resolve();
		this.#closing = new Promise(resolve => { this.#resolveClose = resolve; });
		native("xs_live_transport_close").call(this);
		return this.#closing;
	}
	#poll() {
		for (let i = 0; i < 16; i++) {
			const event = native("xs_live_transport_read").call(this);
			if (!event) break;
			if (event.type === "released") {
				Timer.clear(this.#timer);
				this.#finalStats = native("xs_live_transport_stats").call(this);
				this.#released = true;
				native("xs_live_transport_release").call(this);
				this.#resolveClose?.();
				this.#callback = undefined;
				break;
			}
			this.#callback?.(event);
		}
	}
}
