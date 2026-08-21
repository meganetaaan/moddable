/*
 * Copyright (c) 2026 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

class Tab5WHIP extends Native("xs_tab5_whip_destructor") {
	constructor({url = "", token = ""} = {}) {
		super();
		native("xs_tab5_whip_constructor").call(this, url, token);
	}

	start() {
		return native("xs_tab5_whip_start").call(this);
	}

	stop() {
		return native("xs_tab5_whip_stop").call(this);
	}

	query() {
		return native("xs_tab5_whip_query").call(this);
	}

	get status() {
		return native("xs_tab5_whip_status_get").call(this);
	}

	get error() {
		return native("xs_tab5_whip_error_get").call(this);
	}
}

export default Tab5WHIP;
