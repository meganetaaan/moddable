/*
 * Copyright (c) 2026  Moddable Tech, Inc.
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

import SMBus from "embedded:io/smbus";
import PI4IOE5V6408 from "embedded:io/provider/PI4IOE5V6408";
import configureES7210 from "embedded:peripheral/AudioCodec/ES7210";
import configureES8388 from "embedded:peripheral/AudioCodec/ES8388";

const i2c = Object.freeze({
	io: SMBus,
	data: 31,
	clock: 32,
	port: 1
});

export default function(done) {
	configureES7210({sensor: i2c});
	configureES8388({sensor: i2c});
	using expander = new PI4IOE5V6408({address: 0x43, i2c});
	using speaker = new expander.Digital({pin: 1, mode: expander.Digital.Output});
	speaker.write(1);
	done?.();
}
