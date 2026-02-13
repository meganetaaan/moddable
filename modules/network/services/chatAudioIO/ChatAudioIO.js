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

import AudioIn from "embedded:io/audio/in";
import AudioOut from "embedded:io/audio/out";
import Timer from "timer";
import Worker from "worker";

function computeLevel(buffer) { return native("xs_computeLevel").call(this, buffer); };
function log(message) { trace(`[ChatAudioIO] ${message}\n`); }

class ChatAudioIO {
	static FAILED = -1;
	static DISCONNECTED = 0;
	static DISCONNECTING = 1;
	static CONNECTING = 2;
	static CONNECTED = 3;
	static SPEAKING = 4;		// user is speaking (sending audio to cloud)
	static LISTENING = 5;		// user is listening (receiving audio from cloud) 
	static WAITING = 6;
	static states = [
		"DISCONNECTED",
		"DISCONNECTING",
		"CONNECTING",
		"CONNECTED",
		"SPEAKING",
		"LISTENING",
		"WAITING"
	];
	static {
		ChatAudioIO.states[-1] = "FAILED";
		Object.freeze(ChatAudioIO.states);
	}

	constructor(options) {
		this.error = "";
		this.state = ChatAudioIO.DISCONNECTED;

		this.input = null;
		this.inputBufferOffset = 0;
		this.inputBufferSize = 512 * 1024;
		this.inputBuffer = new SharedArrayBuffer(this.inputBufferSize);
		this.inputSampleRate = 24000;
		this.ready = false;
		
		this.output = null;
		this.outputBufferSize = 512 * 1024;
		this.outputBuffer = new SharedArrayBuffer(this.outputBufferSize);
		this.outputSampleRate = 24000;
	   	this.outputBufferHead = 0;
		this.outputBufferTail = 0;
		this.outputBufferQueued = 0;
	 	this.barrier = new Int32Array(new SharedArrayBuffer(4));
		this.inputDeferred = false;
		// Keep startup allocations small on constrained heaps.
		this.outputChunkSize = 2048;
		this.outputChunkCursor = 0;
		this.outputChunkViews = [];
		for (let i = 0; i < 4; i++)
			this.outputChunkViews.push(new Uint8Array(new ArrayBuffer(this.outputChunkSize)));
		this.outputChunkBusy = new Uint8Array(this.outputChunkViews.length);
		this.outputCompletionTails = [];
		this.outputCompletionSlots = [];
		this.outputCompletionsHead = 0;
		this.outputCompletionCallback = () => this.outputCompleted();
		this.outputStarted = false;
		this.outputPrebufferMS = 160;
		this.outputPrebufferBytes = this.computeOutputPrebufferBytes(this.outputSampleRate);
		this.outputPrebuffering = false;
		this.outputLevelIntervalMS = 50;
		this.outputLevelAt = 0;
      
		this.level = 0;
		this.microphone = 1;
		this.volume = 1;
		
		const callback = () => {};
		this.onFunctionCall = options.onFunctionCall ?? callback;
		this.onInputLevelChanged = options.onInputLevelChanged ?? callback;
		this.onInputTranscript = options.onInputTranscript ?? callback;
		this.onOutputLevelChanged = options.onOutputLevelChanged ?? callback;
		this.onOutputTranscript = options.onOutputTranscript ?? callback;
		this.onStateChanged = options.onStateChanged ?? callback;

		this.createWorker(options.specifier, options.instructions, options.functions, options.voiceID, options.providerID, options.modelID);
	}
	close() {
		this.worker?.terminate();
		this.worker = null;
		this.output?.close();
		this.output = null;
		this.outputStarted = false;
		this.outputPrebuffering = false;
		this.resetOutputAsyncState();
		this.input?.close();
		this.input = null;
	}
	changeMicrophone(microphone) {
		this.microphone = microphone;
	}
	changeVolume(volume) {
		this.volume = volume;
		if (this.output)
			this.output.volume = volume;
	}
	createWorker(specifier, instructions, functions, voiceID, providerID, modelID) {
		log(`createWorker specifier=${specifier}`);
		this.worker = new Worker(specifier, {
			static: 512 * 1024,
			chunk: {
				initial: 64 * 1024,
				incremental: 8 * 1024
			},
			heap: {
				initial: 1024,
				incremental: 256
			},
			stack: 1024
		});
		this.worker.onmessage = message => {
			this[message.id](message);
		};
		this.worker.postMessage({ 
			id: "configure", 
			instructions,
			functions,
			voiceID,
			providerID,
			modelID
		})
 		this.ensureInput();
	}
	configureAudio(message) {
		const inputSampleRate = message.inputSampleRate ?? 24000;
		if (this.inputSampleRate != inputSampleRate) {
			this.inputSampleRate = inputSampleRate;
			if (this.input) {
				this.input.close();
				this.input = null;
				this.ensureInput();
			}
		}
		const outputSampleRate = message.outputSampleRate ?? 24000;
		if (this.outputSampleRate != outputSampleRate) {
			this.outputSampleRate = outputSampleRate;
			if (this.output) {
				this.output.close();
				this.output = null;
				this.ensureOutput();
			}
		}
		const outputPrebufferMS = message.outputPrebufferMS;
		if ((outputPrebufferMS !== undefined) && (this.outputPrebufferMS != outputPrebufferMS))
			this.outputPrebufferMS = outputPrebufferMS;
		this.outputPrebufferBytes = this.computeOutputPrebufferBytes(this.outputSampleRate);
	}
	connect() {
		log("connect");
		this.state = ChatAudioIO.CONNECTING;
		this.inputBufferOffset = 0;
		Atomics.store(this.barrier, 0, 0);
		this.worker.postMessage({ id:"connect", inputBuffer: this.inputBuffer, outputBuffer: this.outputBuffer, barrier: this.barrier });
		this.onStateChanged(this.state);
	}
	connected() {
		log("connected");
		this.state = ChatAudioIO.CONNECTED;
		this.onStateChanged(this.state);
		this.state = ChatAudioIO.SPEAKING;
		if (this.ready)
			this.onStateChanged(this.state);
	}
	disconnect() {
		log("disconnect");
		this.state = ChatAudioIO.DISCONNECTING;
		this.worker.postMessage({ id:"disconnect" });
		this.onStateChanged(this.state);
	}
	disconnected() {
		log("disconnected");
		this.error = "";
		this.state = ChatAudioIO.DISCONNECTED;
		this.ensureInput();
		this.onStateChanged(this.state);
	}
	failed(message) {
		log(`failed: ${message?.string ?? "unknown"}`);
		this.error = message.string;
		this.state = ChatAudioIO.FAILED;
		this.ensureInput();
		this.onStateChanged(this.state);
	}
	listen() {
		if (this.state == ChatAudioIO.SPEAKING) {
			this.state = ChatAudioIO.LISTENING;
// 			this.outputBufferStart = undefined;
			this.outputPrebuffering = true;
			this.ensureOutput();
			this.onStateChanged(this.state);
		}
	}
	receiveAudio(message) {
		let head = message.offset + message.size;
		if (head >= this.outputBufferSize)
			head -= this.outputBufferSize;
		this.outputBufferHead = head;
		this.maybeStartOutput();
	}
	receiveFunctionCall(message) {
		this.onFunctionCall(message.call, message.name, message.parameters);
	}
	receiveInputText(message) {
		this.onInputTranscript(message.text, message.more);
	}
	receiveOutputText(message) {
		this.onOutputTranscript(message.text, message.more);
	}
	sendFunctionResult(call, name, result) {
		this.worker.postMessage({ id: "sendFunctionResult", call, name, result });
	}
	sendText(text) {
		if (this.state < ChatAudioIO.CONNECTED)
			throw new Error("not connected");
		if (this.state > ChatAudioIO.SPEAKING)
			throw new Error("listening");
		this.worker.postMessage({  id: "sendText", text });
	}
	speak() {
		this.state = ChatAudioIO.WAITING;
	}
	maybeOutputFinished() {
		if (
			(this.state == ChatAudioIO.WAITING) &&
			(this.outputBufferTail == this.outputBufferQueued) &&
			(this.outputBufferQueued == this.outputBufferHead)
		) {
			this.worker.postMessage({ id:"listened" });
			this.state = ChatAudioIO.SPEAKING;
			if (!this.inputDeferred) {
				this.inputDeferred = true;
				Timer.set(() => {
					this.inputDeferred = false;
					// Defer close/open outside AudioOut completion callback context.
					if (this.state == ChatAudioIO.SPEAKING)
						this.ensureInput();
				}, 0);
			}
		}
	}
	outputPlayed(tail) {
		// Ignore late callbacks that may race with close()/state changes.
		if (!this.output)
			return;
		this.outputBufferTail = tail;
		Atomics.store(this.barrier, 0, tail);
		Atomics.notify(this.barrier, 0);
		this.maybeOutputFinished();
	}
	outputCompleted() {
		const head = this.outputCompletionsHead;
		if (head >= this.outputCompletionTails.length)
			return;
		const tail = this.outputCompletionTails[head];
		const slot = this.outputCompletionSlots[head];
		this.outputCompletionTails[head] = undefined;
		this.outputCompletionSlots[head] = undefined;
		if (slot !== undefined)
			this.outputChunkBusy[slot] = 0;
		this.outputCompletionsHead = head + 1;
		if (this.outputCompletionsHead == this.outputCompletionTails.length)
			this.resetOutputAsyncState();
		this.outputPlayed(tail);
	}
	acquireOutputChunk() {
		const busy = this.outputChunkBusy;
		const length = busy.length;
		let cursor = this.outputChunkCursor;
		for (let i = 0; i < length; i++) {
			const index = (cursor + i) % length;
			if (!busy[index]) {
				busy[index] = 1;
				this.outputChunkCursor = (index + 1) % length;
				return index;
			}
		}
		return -1;
	}
	resetOutputAsyncState() {
		this.outputCompletionTails.length = 0;
		this.outputCompletionSlots.length = 0;
		this.outputCompletionsHead = 0;
		this.outputChunkBusy.fill(0);
	}
	computeOutputPrebufferBytes(sampleRate) {
		let bytes = Math.round((sampleRate * 2 * this.outputPrebufferMS) / 1000);
		if (bytes < this.outputChunkSize)
			bytes = this.outputChunkSize;
		return bytes;
	}
	bufferedOutputBytes(start = this.outputBufferQueued) {
		const stop = this.outputBufferHead;
		return (stop - start + this.outputBufferSize) % this.outputBufferSize;
	}
	maybeStartOutput() {
		if (!this.output || this.outputStarted)
			return;
		if (this.outputPrebuffering && (this.bufferedOutputBytes() < this.outputPrebufferBytes))
			return;
		this.outputPrebuffering = false;
		this.output.start();
		this.output.volume = this.volume;
		this.outputStarted = true;
		this.outputLevelAt = Date.now();
	}
	
	ensureInput() {
		if (this.input) return;
		this.output?.close();
		this.output = null;
		this.outputStarted = false;
		this.outputPrebuffering = false;
		this.resetOutputAsyncState();
		let when = Date.now() + 500;
		this.input = new AudioIn({
			sampleRate: this.inputSampleRate,
			onReadable: (size) => {
				if (!this.ready) {
					if (Date.now() >= when) {
						this.ready = true;
						if (this.state != ChatAudioIO.DISCONNECTED)
							this.onStateChanged(this.state);
					}
					else
						return;
				}
				if (!this.microphone)
					return;
				let delta = this.inputBufferSize - this.inputBufferOffset;
				if (delta < size) {
					this.inputBufferOffset = 0;
					delta = this.inputBufferSize;
				}
				const samples = new Uint8Array(this.inputBuffer, this.inputBufferOffset, size);
				this.input.read(samples);
				const level = computeLevel(samples);
				if (this.level != level) {
					this.level = level;
					this.onInputLevelChanged(level);
				}
				if (this.state == ChatAudioIO.SPEAKING) {
					this.worker.postMessage({ id:"sendAudio", offset:this.inputBufferOffset, size });
				}
				this.inputBufferOffset += size;
			},
		});
		this.input.start(); 
	}
	ensureOutput() {
		if (this.output) return;
		this.input?.close();
		this.input = null;
		this.ready = false;
		this.outputBufferQueued = this.outputBufferTail;
		this.outputStarted = false;
		this.outputPrebuffering = (this.state == ChatAudioIO.LISTENING);
		this.resetOutputAsyncState();
		this.output = new AudioOut.Async({
			sampleRate: this.outputSampleRate,
			onWritable: (size) => {
				const now = Date.now();
				const updateLevel = now >= this.outputLevelAt;
				if (updateLevel)
					this.outputLevelAt = now + this.outputLevelIntervalMS;
				let start = this.outputBufferQueued;
				let stop = this.outputBufferHead;
				let level = updateLevel ? 0 : this.level;
				const chunkSize = this.outputChunkSize;
				while (size > 0) {
					let delta = 0;
					if (stop < start) {
						delta = this.outputBufferSize - start;
					}
					else if (start < stop) {
						delta = stop - start;
					}
					else {
						break;
					}
					if (delta > size)
						delta = size;
					if (delta > chunkSize)
						delta = chunkSize;
					if (delta <= 0)
						break;

					const slot = this.acquireOutputChunk();
					if (slot < 0)
						break;

					const samples = new Uint8Array(this.outputBuffer, start, delta);
					if (updateLevel) {
						const samplesLevel = computeLevel(samples);
						if (level < samplesLevel)
							level = samplesLevel;
					}

					const chunk = this.outputChunkViews[slot];
					chunk.set(samples);
					let next = start + delta;
					if (next == this.outputBufferSize)
						next = 0;

					this.outputCompletionTails.push(next);
					this.outputCompletionSlots.push(slot);
					this.output.write((delta == chunkSize) ? chunk : chunk.subarray(0, delta), this.outputCompletionCallback);
					start = next;
					size -= delta;
				}
				this.outputBufferQueued = start;
				this.maybeOutputFinished();
				if (updateLevel && (this.level != level)) {
					this.level = level;
					this.onOutputLevelChanged(level);
				}
			},
		});
		this.maybeStartOutput();
	}
}

export default ChatAudioIO;
