- Feature Name: wasm_audio_io
- Start Date: 2026-02-06
- RFC PR: (TBD)
- Related Issue: (TBD)
- Target: TypeScript

## Summary
[summary]: #summary

Add `embedded:io/audio/in` and `embedded:io/audio/out` support to the `wasm` target by bridging XS to WebAudio through Emscripten glue, enabling microphone capture and speaker playback in the browser while keeping the existing JS API and callback semantics intact.

## Motivation
[motivation]: #motivation

The `wasm` target currently supports Piu and Commodetto but explicitly lacks Pins/IO, which prevents any audio input or output in the browser. Meanwhile, the Moddable SDK already provides IO-level audio modules for macOS, Windows, Linux, ESP32, and Pico (`modules/io/audioin/*`, `modules/io/audioout/*`) with a stable JS API (callbacks, `read`/`write`, `volume`). This means examples like `examples/io/audioin/*`, `examples/io/audioout/*`, and higher-level modules such as `modules/network/services/chatAudioIO/ChatAudioIO.js` cannot run on the wasm target even though the browser has a first-class audio stack (WebAudio).

Providing audio on wasm unlocks realistic end-to-end testing of audio pipelines (record, process, playback), allows demos that rely on microphone or speaker output, and makes the wasm target a closer behavioral match to desktop simulators. This is especially important for contributors who prototype audio features in a browser before moving to device hardware.
The concrete target is that the IO audio examples (`examples/io/audioin/*`, `examples/io/audioout/*`) successfully build for the `wasm` target.

Concrete use cases:
- Run `examples/io/audioin/levelmonitor` and `examples/io/audioout/play-sync` directly in the browser.
- Prototype conversational audio flows (e.g., microphone capture + speaker playback) without needing hardware.
- Validate audio buffer sizing, callback cadence, and latency behavior in a widely accessible environment.

## Guide-level explanation
[guide-level-explanation]: #guide-level-explanation

After this change, wasm builds can import and use IO audio modules the same way as desktop simulators:

```javascript
import AudioIn from "embedded:io/audio/in";
import AudioOut from "embedded:io/audio/out";

const input = new AudioIn({
  sampleRate: 24000,
  channels: 1,
  onReadable(size) {
    const buffer = new ArrayBuffer(size);
    this.read(buffer);
    // process buffer
  }
});
input.start();

const output = new AudioOut({
  sampleRate: 24000,
  channels: 1,
  onWritable(size) {
    // write LPCM samples into the output buffer
    this.write(new Uint8Array(size));
  }
});
output.start();
```

Key points for contributors:
- The API is the existing `embedded:io/audio/in` and `embedded:io/audio/out` API. No wasm-specific JS changes are required in app code.
- WebAudio requires a user gesture to start audio. The wasm host page will prompt or use an existing gesture (e.g., click/tap) to resume the `AudioContext` before audio starts.
- Microphone access requires browser permission. If permission is denied, `AudioIn` construction or `start()` will throw an error, similar to how native implementations fail when a device cannot be opened.
- The format is still interleaved LPCM (`audioType: "LPCM"`) with 8- or 16-bit samples and 1 or 2 channels. `format` remains `"buffer"` only.
- `sampleRate` is best-effort: the browser may choose a different rate. The actual rate is exposed via `input.sampleRate`/`output.sampleRate` and should be used by callers that require exact timing.

Existing convenience wrappers like `AudioIn.Async` and `AudioOut.Async` continue to work because they are implemented in JS on top of the same callbacks.

## Reference-level explanation
[reference-level-explanation]: #reference-level-explanation

### Scope and module mapping
- Add wasm platform entries to the IO audio manifests so that the wasm target can resolve:
  - `embedded:io/audio/in` -> `modules/io/audioin/wasm/audioin`
  - `embedded:io/audio/out` -> `modules/io/audioout/wasm/audioout`
- Pins/IO remains unsupported in wasm; this RFC only addresses the embedded IO audio modules.

### JS <-> wasm glue
The wasm target already uses Emscripten glue in `build/makefiles/wasm/main.c` and a JS host in `build/makefiles/wasm/index.html`. Audio follows the same pattern:

- Introduce a JS audio bridge (either in `index.html` or an imported `wasm-audio.js`) that owns a `WebAudio` graph and exposes functions to:
  - create/destroy input and output devices
  - start/stop streams
  - read from / write to ring buffers
  - notify wasm when buffers are readable/writable
- Add C entry points in the wasm audio modules that call into the JS bridge via `EM_JS` / `EM_ASM`, and export functions for JS to call back into wasm when it needs to schedule `onReadable` / `onWritable`.

### Audio graph and buffering
A minimal, low-latency design:

- **AudioOut**
  - Create a shared `AudioContext` (one per page).
  - Use an `AudioWorkletNode` (preferred) with a fallback to `ScriptProcessorNode` if `AudioWorklet` is unavailable.
  - Maintain a ring buffer of interleaved PCM bytes in JS.
  - `AudioOut.write()` copies data from wasm memory into the ring buffer.
  - The audio callback pulls samples, converts int8/int16 to float32, applies `volume` (0..1), and outputs to the device.
  - When ring free space exceeds a threshold, JS schedules a wasm callback to fire `onWritable(size, sampleCount)` on the XS thread.

- **AudioIn**
  - Use `navigator.mediaDevices.getUserMedia({ audio: { channelCount, sampleRate, ... } })` to obtain a mic stream.
  - Route the stream to an `AudioWorkletNode` (or `ScriptProcessorNode` fallback).
  - The audio callback converts float32 frames to interleaved int8/int16 and pushes into a JS ring buffer.
  - When ring buffered bytes exceed a threshold, JS schedules a wasm callback to fire `onReadable(size, sampleCount)` on the XS thread.
  - `AudioIn.read()` copies data from the ring buffer into the caller-provided buffer (or allocates a new ArrayBuffer when requested, matching existing behavior).

### Callback threading model
Other platforms guarantee that JS callbacks are invoked on the XS main thread, not from the audio thread. The wasm version should do the same by:
- scheduling callbacks via `emscripten_async_call` or a dedicated postMessage/queue mechanism,
- ensuring no JS callback is executed inside a WebAudio render callback.

This mirrors the Linux implementation that uses a worker thread for ALSA and dispatches to the main thread via GLib idle sources.

### Format, rate, and validation
- Only `audioType: "LPCM"` and `format: "buffer"` are supported, consistent with existing IO audio modules.
- `bitsPerSample` allowed: 8 or 16. `channels` allowed: 1 or 2.
- `sampleRate` is requested when creating the `AudioContext` and when calling `getUserMedia`. The browser may ignore the request; the actual rate is returned via `sampleRate` getters.
- `write()` throws if the requested byte length exceeds available space (matching other platforms).
- `read()` throws if the requested byte length exceeds available data (matching other platforms).

### Host page integration
Because browsers require a user gesture to start audio, the wasm host page will:
- create the `AudioContext` in a suspended state,
- call `AudioContext.resume()` on the first user gesture (tap/click),
- surface a simple "Tap to enable audio" hint if audio is requested before a gesture.

### Build considerations
The wasm build must export the callback entry points used by the JS bridge. This can be done via `EMSCRIPTEN_KEEPALIVE` or explicit exports in the Emscripten link flags. No new native libraries are required.

## Drawbacks
[drawbacks]: #drawbacks

- WebAudio adds a non-trivial JS glue layer and new error cases (permission denied, unsupported APIs, autoplay restrictions).
- Latency and timing can vary between browsers, which may make audio tests less deterministic than native simulators.
- Sample rate and channel count requests are best-effort and may not be honored, requiring resampling or adaptive behavior.
- The wasm host page must change to handle gesture-based audio unlock, which is extra complexity for a "simple" simulator.

## Rationale and alternatives
[rationale-and-alternatives]: #rationale-and-alternatives

- **Why embedded IO instead of pins/audioout?** The wasm target already declares Pins/IO unsupported. Embedded IO audio aligns with desktop simulator behavior and existing examples, and does not require emulating I2S-specific features.
- **Why WebAudio?** It is the standard browser audio API and supports both playback and capture with low latency. Alternatives like WebRTC APIs are oriented toward streaming and do not map cleanly to the existing `read`/`write` model.
- **Why AudioWorklet first?** `AudioWorklet` is the modern, low-latency path. `ScriptProcessorNode` is deprecated but still useful as a fallback for older browsers.
- **Why not rely on Emscripten SDL audio?** SDL audio abstracts a different API surface and would require translating Moddable’s IO callbacks into SDL’s pull model; it also would not help with microphone input without additional glue.

## Prior art
[prior-art]: #prior-art

- Existing IO audio implementations for macOS, Windows, Linux, ESP32, and Pico (`modules/io/audioin/*`, `modules/io/audioout/*`) define the API contract and callback semantics.
- The Linux simulator design document (`linux-sim-audio.md`) illustrates the threading model of audio callbacks dispatched to the XS main thread.
- The wasm target already bridges UI and timers with Emscripten (`build/makefiles/wasm/main.c`, `modules/base/timer/wasm/timer.c`), providing a pattern for JS <-> wasm integration.
- WebAudio (AudioContext, AudioWorklet, getUserMedia) is standard browser practice for low-latency audio I/O.

## Unresolved questions
[unresolved-questions]: #unresolved-questions

- What default ring buffer size and callback thresholds provide a good balance of latency and glitch-free playback across browsers?
- Should we implement a resampler in JS or C to guarantee requested `sampleRate`, or accept the browser-provided rate as-is?
- How should device selection be exposed (if at all) using the existing `AudioInOptions` / `AudioOutOptions` shape?
- What is the best place to host the audio bridge JS (inline in `index.html` vs a separate module) to keep the wasm host page maintainable?

## Future possibilities
[future-possibilities]: #future-possibilities

- Add optional resampling to match requested sample rates when the browser cannot honor them.
- Support audio processing features (echo cancellation, noise suppression, AGC) via `getUserMedia` constraints.
- Provide a device selection UI on the wasm host page and map it to `AudioInOptions.target`.
- Add a pins-level wrapper for `pins/audioout` that routes to embedded IO on wasm, if needed for compatibility with existing pins-based examples.
- Integrate audio loopback or file-based inputs for deterministic testing in CI.
