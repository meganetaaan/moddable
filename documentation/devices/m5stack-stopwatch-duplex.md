# StopWatch full-duplex audio

The StopWatch target enables shared input/output through `device.audio.Input`, `device.audio.Output` and `device.audio.Output.Async`. The supported format is 16 kHz, mono, signed 16-bit PCM. Targets without `MODDEF_AUDIO_DUPLEX` retain their existing native paths.

## Ownership and lifecycle

RX is the fixed I2S master. TX is a slave on the same port. The native manager retains RX clocks while either direction needs them, even if no public Input remains. A closed Input has no recording task or application callback. RX uses stereo DMA; the input reader extracts one 16-bit sample per frame for the mono API. TX uses the left mono slot with matching frame timing.

Input and output share one ES8311 instance. Starting the first active direction arms the codec; starting its peer does not reset the running codec. Stopping output disables the amplifier. Stopping input stops sample delivery without stopping the peer's clocks. Closing the last owner releases the codec and native channels. Reopening output creates a fresh TX channel rather than reusing old buffers.

Use explicit `stop()` and `close()` to release resources. Closing a direction does not close its peer. Full duplex is not AEC: the microphone can capture speaker output.

## Example and tests

```sh
cd $MODDABLE/examples/devices/m5stack-stopwatch-duplex
mcconfig -m -p esp32/m5stack_stopwatch -t build
```

Follow the [device partition and backup precautions](m5stack-stopwatch.md#flash-safety) before flashing. The example uses the standard board provider, not a parallel diagnostic implementation.

From the SDK root:

```sh
python3 modules/embedded/common/audioDuplex.test.py
node build/devices/esp32/targets/m5stack_stopwatch/host/audio-provider.test.mjs
```

The native mock compiles the manager against a fake I2S driver and exercises partial initialization failures, duplicate allocation, construction order, peer stop/close/reopen and final disposal. Provider mocks cover shared codec ownership and cleanup.

The hardware example reports capture samples and output callbacks. Input counts should freeze during input stop/close while output advances, and resume after reopening. Output counts should freeze during output stop/close while input advances. The final sequence exercises callback-triggered input close/reopen.

## Evidence and limitations

A short integrated-provider hardware run completed the peer lifecycle sequence and eight callback-triggered input close/reopen cycles without an observed reset. This validates those exercised paths, not every task/ISR interleaving. Repeat the run after porting to another SDK release or changing native audio code.

Long-run heap stability, restart transients, exact clock accuracy, latency bounds and acoustic quality remain unmeasured. Software callback counts alone are not evidence of sound quality or echo cancellation.
