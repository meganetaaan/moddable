/*
 * Copyright (c) 2026  Moddable Tech, Inc.
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

import files from "embedded:storage/files";

const path = "moddable-sd-test.bin";
const expected = Uint8Array.of(0x54, 0x41, 0x42, 0x35);

files.delete(path);
{
	using file = files.openFile({path, mode: "w+"});
	file.write(expected, 0);
	file.flush();

	const actual = new Uint8Array(file.read(expected.byteLength, 0));
	if (actual.some((value, index) => value !== expected[index]))
		throw new Error("SD card readback mismatch");
}

if (!files.status(path).isFile() || !files.delete(path))
	throw new Error("SD card file operation failed");

trace("SD card read/write passed\n");
