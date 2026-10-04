# Tab5 diagnostics host regression tests

Run from the SDK repository root with Node.js 24 or later:

```sh
node --experimental-vm-modules --test --test-isolation=none examples/piu/tab5-diagnostics/tests/regression.mjs
```

The harness loads the actual `main.js` as a VM module. Hardware imports, Piu globals, storage, and timers are mocked; no board, audio device, microphone, SDK build, or npm dependencies are needed. `using` declarations execute directly, including disposal on readback errors. This is a separate host harness, outside the SDK's test262 runner.

The 19 cases cover delayed SD import success/failure after Back, switching pages, reopening SD, starting a newer run, and shutdown; active SD success and storage failures; interrupted and completed audio replay; Port B reruns and interrupted navigation; and repeated shutdown.

To reproduce the original defects with the same harness, set `TAB5_TEST_REF` to `85270056ca0f8b0b1c7b3d5fd07f2d9c39b12fb0` before running. The harness then reads the production modules from that local Git commit. Keep the variable unset for the fixed files.

These checks establish application lifecycle behavior. They do not verify physical touch orientation, controller calibration, audio playback, electrical loopbacks, or an ESP32-P4 build.
