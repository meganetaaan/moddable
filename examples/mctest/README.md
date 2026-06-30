# mctest

`mctest` is a small experiment for running the same XS-oriented tests through three backends:

- `xst` for low-dependency logic tests.
- `mcsim` for simulator and PIU screen tests.
- `device` for hardware runs whose structured traces are captured by `xsbug-log`.

The test application emits line-delimited JSON through `trace` or `print`:

```json
{"protocol":"mctest/1","type":"test:pass","name":"arithmetic","durationMs":1}
```

The host runner turns those events into `spec`, `json`, or `junit` output and can write the same report to stdout and/or a file for CI artifacts.

## Examples

```sh
node runner.mjs run --target xst
node runner.mjs run --target xst --reporter junit --report-file /tmp/mctest-xst.xml --no-stdout
node runner.mjs run --target device --input fixtures/xsbug-log.txt --reporter junit
node runner.mjs run --target mcsim --reporter junit --report-file /tmp/mctest-mcsim.xml
node runner.mjs run --target mcsim --mc-so $MODDABLE/build/bin/lin/m5stack/debug/mctest/mc.so
node runner.mjs run --target mcsim --screenshot /tmp/mctest-screen.png --report-file /tmp/mctest.xml --reporter junit
node runner.mjs run --target mcsim --mcsim-mode full
node runner.mjs run --target mcsim --headless --app-log stdout --reporter junit --report-file /tmp/mctest.xml --no-stdout
```

For device runs, pipe `xsbug-log` output into the runner or pass a command that produces the same structured log lines:

```sh
node $MODDABLE/tools/xsbug-log/xsbug-log serial2xsbug "$DEBUGGER_PORT" 921600 8N1 \
  | node runner.mjs run --target device --input - --reporter junit --report-file /tmp/mctest-device.xml

node runner.mjs run --target device --device-log-command 'node $MODDABLE/tools/xsbug-log/xsbug-log serial2xsbug "$DEBUGGER_PORT" 921600 8N1'
```

The `mcsim` backend starts a lightweight xsbug TCP collector, builds the app with `mcconfig -d -x 127.0.0.1:<port>` unless `--mc-so` is provided, and launches the simulator with an isolated HOME/XDG config directory. On Linux it uses `xvfb-run -a` when available so multiple simulator jobs can run without sharing a display. It also uses `dbus-run-session` by default so concurrent GTK application instances do not collide on the user's session bus; pass `--no-dbus-run-session` for quieter local single-process runs. It uses the mcsim CLI added here: `mcsim --app <mc.so> --mode minimal`.

Use `--debug-xsbug` to print raw xsbug protocol chunks to stderr while diagnosing simulator startup failures.

## mcsim CLI

Linux mcsim recognizes these options before handing the remaining arguments to GTK:

```sh
mcsim --app path/to/mc.so
mcsim --app path/to/mc.so --mode minimal
mcsim --app path/to/mc.so --minimal
mcsim --app path/to/mc.so --mode headless
mcsim --app path/to/mc.so --headless
mcsim --app path/to/mc.so --mode minimal --screenshot /tmp/screen.png
mcsim --app path/to/mc.so --headless --log stdout
```

`minimal` renders only the simulator device view. `headless` uses the same device-only layout and suppresses presenting the GTK window on Linux; it still needs a display backend, so the runner keeps using `xvfb-run -a` when available. `full` remains the default and keeps the existing toolbar, controls pane, and footer. `--screenshot` writes one PNG after launch and does not exit the process by itself.

Use `mcsim --log stdout` or `mcsim --log stderr` for native mcsim log forwarding without launching xsbug. Use the runner's `--app-log stdout` or `--app-log stderr` when the raw decoded application log should be visible in CI while the runner still owns test-result collection. If stdout is used for application logs, write the structured report to a file and pass `--no-stdout` to avoid mixing logs with JUnit or JSON.

Applications can request any number of screenshots from mcsim during a run:

```js
application.postMessage(JSON.stringify({ mcsim: { screenshot: "/tmp/frame-1.png" } }));
```

## Moddable follow-up plan

This branch makes `--app <mc.so>`, `--mode minimal`, `--mode headless`, `--log stdout|stderr`, one-shot `--screenshot <path>`, and app-requested screenshots usable on Linux. The next Moddable changes should extend that into a complete CI interface:

- Keep xsbug host, xsbug port, local data directory, and display mode as explicit CLI/env inputs so multiple simulator instances can run in parallel across all desktop platforms.

The runner intentionally treats `run:done` as the exit signal. The one-shot CLI screenshot does not force process exit; the host process terminates mcsim from outside after the test run is done.
