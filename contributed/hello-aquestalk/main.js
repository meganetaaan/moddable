/*
 * Copyright (c) 2016-2017  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 * 
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <https://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 *
 */

import TTS from 'tts'
import AudioOut from "pins/audioout";
import Timer from 'timer'

let tts = new TTS()
global.speaker.enqueue(0, AudioOut.Volume, 32)
tts.setSpeech("korewa onse-ki'go-de_su.")
let LEN = 8
let samples = []
let queueCount = 0
try {
	while (true) {
		const s = new SharedArrayBuffer(4096);
		samples.push(s);
		if (samples.length > LEN)
			break;
  }
  trace("ok\n")
} catch(e) {
  trace(e.message)
}

let speaker = global.speaker
let s, bufLen, len, elementCount, finished
let handler = Timer.repeat(() => {
  elementCount = speaker.getElementCount()
  if (elementCount >= 8) {
    return
  }
  bufLen = 0
  len = 0
  s = samples.shift()
  if (s == null) {
    return
  }
  while(true) {
    if (bufLen + len > LEN) {
      break
    }
    len = tts.syntheFrame(s, bufLen);
    if (len < 0) {
      finished = true
      break
    }
    bufLen += len
  }
  if (bufLen > 0) {
    trace(`queueCount: ${queueCount++}\n`)
    speaker.enqueue(0, AudioOut.RawSamples, s, 1, 0, bufLen >> 1);
  }
  if (finished) {
    Timer.clear(handler)
    speaker.enqueue(0, AudioOut.Callback, 0);
  }
  samples.push(s);
}, 15)

speaker.callback = function() {
  trace("playback finished\n")
}
