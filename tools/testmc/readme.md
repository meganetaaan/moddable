Updated: July 29, 2024

### Documentation

For in-depth documentation on using testmc see [Testing](../../documentation/tools/testing.md).

`testmc` now supports `screen.captureImage(path)` for PNG snapshots when running with `mcconfig -dl` and `xsbug-log`.

### Headless Runner (experimental)

`mctest.js` provides a CLI runner for headless test execution.

```text
node tools/testmc/mctest.js list --app testmc --root tests/modules --select piu/rgb565le/*
node tools/testmc/mctest.js run --app testmc --root tests/modules --select piu/rgb565le/* --launch "mcconfig -d -m -p sim/moddable_two"
node tools/testmc/mctest.js rerun --failed ./artifacts/report.json
```

### Temporary simulator operation (Linux)

For now, run `testmc` tests as **one test per process** on simulator targets.

Reason:
- `mcsim` is effectively single-instance in this workflow.
- Non-module tests may leak globals across sequential runs in one process.

Recommended loop:

```bash
node tools/testmc/mctest.js list --app testmc --root tests/modules --select 'piu/rgb565le/*' | \
while IFS= read -r test; do
	[ -z "$test" ] && continue
	mcconfig -dn -m -p lin -x 127.0.0.1:5124 -t build || break
	node tools/testmc/mctest.js run \
		--app testmc \
		--root tests/modules \
		--select "$test" \
		--host 127.0.0.1 \
		--port 5124 \
		--launch "xvfb-run -a mcconfig -dn -m -p lin -x 127.0.0.1:5124 -t xsbug" \
		--connect-timeout 60000 \
		--timeout 60000 || break
done
```

> **Note**: `mctest.js run --select a,b,c` can work for module-only batches, but single-test execution is the safe default for current simulator operation.

> **Note**: `mctest.js` reuses `tools/xsbug-log/xsbug-machine.js`. Run `npm install` in `tools/xsbug-log` first.

### Manifests

`testmc` may be built with different manifests to test different combinations of features. 

- [`manifest_common.json`](./manifest_common.json) - Shared by all builds of `testmc`.
- [`manifest.json`](./manifest.json) - The default `testmc` configuration. Used to run the majority of unit tests.

	```text
	mcconfig -d -m -p esp32
	```

- [`manifest_ota.json`](./manifest_ota.json) - A smaller version of `testmc` used to test OTA on ESP32.

	```text
	mcconfig -d -m -p esp32 manifest_ota.json
	```

> **Note**: When switching between builds of `testmc` you should do a clean (`-t clean`) to avoid possible conflicts between variants.

```text
mcconfig -d -m -p esp32 manifest_ota.json -t clean
```
