/*
 * Copyright (c) 2024-2025 Moddable Tech, Inc.
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
import Codec from "embedded:peripheral/Audio/ES8311";
import AudioInput from "embedded:io/audio/in";
import AudioOutput from "embedded:io/audio/out";

export default function createAudioDevices(getDevice) {
    let codec, inputOwner, outputOwner;
    let active;
    function release(owner, input) {
        active?.delete(owner);
        if (input && inputOwner === owner) inputOwner = undefined;
        if (!input && outputOwner === owner) outputOwner = undefined;
        if (!inputOwner && !outputOwner) {
            const last = codec;
            codec = undefined;
            last?.close();
        }
    }
    function make(Base, input) {
        return class extends Base {
            #closed = false; #started = false; #amplifier;
            constructor(options = {}) {
                if ((options.sampleRate ?? 16000) !== 16000 || (options.channels ?? 1) !== 1 || (options.bitsPerSample ?? 16) !== 16)
                    throw new RangeError("16 kHz mono 16-bit audio required");
                if (input ? inputOwner : outputOwner) throw new Error("audio direction already in use");
                super(options);
                if (input) inputOwner = this; else outputOwner = this;
                try {
                    active ??= new Set();
                    if (!input) {
                        const device = getDevice();
                        this.#amplifier = new device.io.Digital({pin: 14, mode: device.io.Digital.Output, initialValue: 0});
                        this.#amplifier.write(0);
                    }
                    if (!codec) {
                        ioExpander.write(3, 1);
                        Timer.delay(10);
                        const device = getDevice();
                        codec = new Codec({...device.i2c.default, io: device.io.SMBus});
                        codec.configure({input: true, output: true});
                    }
                }
                catch (e) { try { this.close(); } catch {} throw e; }
            }
            #disableAmplifier() {
                if (!this.#amplifier) return;
                try { this.#amplifier.write(0); }
                finally { ioExpander.write(10, 0); }
            }
            #closeAmplifier() {
                const amplifier = this.#amplifier;
                try { this.#disableAmplifier(); }
                finally { this.#amplifier = undefined; amplifier?.close(); }
            }
            start() {
                if (this.#closed) throw new Error("audio closed");
                if (this.#started) return;
                try {
                    super.start();
                    if (!active.size) codec.start();
                    active.add(this);
                    if (!input) { ioExpander.write(10, 1); this.#amplifier.write(1); Timer.delay(10); }
                    this.#started = true;
                }
                catch (e) { try { this.close(); } catch {} throw e; }
            }
            stop() {
                if (this.#closed) throw new Error("audio closed");
                try {
                    try { this.#disableAmplifier(); }
                    finally { this.#started = false; active.delete(this); super.stop(); }
                }
                catch(e) { try { this.close(); } catch {} throw e; }
            }
            close() {
                if (this.#closed) return;
                this.#closed = true;
                try { this.#closeAmplifier(); }
                finally { try { super.close(); } finally { release(this, input); } }
            }
            static { Object.defineProperty(this.prototype, Symbol.dispose, {value: this.prototype.close, writable: true, configurable: true}); }
        };
    }
    const Output = make(AudioOutput, false);
    Object.defineProperty(Output, "Async", {value: make(AudioOutput.Async, false), writable: true, configurable: true});
    return {Input: make(AudioInput, true), Output};
}
