---
name: moddable-debug-log-focus
description: Focus on actionable Moddable debug logs using current tooling only (mcconfig targets, xsbug-log, and terminal filtering) without changing SDK tools. Use when build logs are noisy, runtime logs are mixed with deploy output, or quick failure triage is needed.
---

# Moddable Debug Log Focus

Use this skill to reduce noise and isolate runtime/debug signals.

## Separate Build/Deploy/Runtime Logs

Run build, deploy, and debug in separate commands.

```bash
mcconfig -d -m -p esp32/moddable_two -t build
mcconfig -d -m -p esp32/moddable_two -t deploy
mcconfig -dl -m -p esp32/moddable_two -t xsbug
```

Use `-dl` for terminal logging through `xsbug-log`.

## Simulator Triage Rule for testmc

When reproducing `testmc` failures on Linux simulator, run one test per process.

```bash
PORT=5124
mcconfig -dn -m -p lin -x 127.0.0.1:$PORT -t build
node tools/testmc/mctest.js run \
  --app testmc \
  --root tests/modules \
  --select piu/rgb565le/examples/balls.js \
  --host 127.0.0.1 \
  --port "$PORT" \
  --launch "xvfb-run -a mcconfig -dn -m -p lin -x 127.0.0.1:$PORT -t xsbug"
```

Avoid batching non-module tests in a single run when triaging log signatures.

## Capture Logs to File for Repeatable Triage

Capture runtime logs and filter them with `rg`.

```bash
mcconfig -dl -m -p esp32/moddable_two -t xsbug 2>&1 | tee /tmp/moddable-runtime.log
rg -n "(ERROR|FAIL|Exception|panic|assert|timeout)" /tmp/moddable-runtime.log
```

Use additional filters as needed:

```bash
rg -n "(DEBUG|TRACE|UI|NET|AUDIO)" /tmp/moddable-runtime.log
```

## Apply Log Prefixing in App Code

Prefix lines so filtering is deterministic.

- `trace("<info>[UI] mounted\\n")`
- `trace("<warn>[NET] retrying\\n")`
- `trace("<error>[AUDIO] underrun\\n")`

This works with xsbug color tags and simple grep/rg.

## Optional Plugin Mode with Existing xsbug-log Hook

Use `XSBUG_LOGMACHINE` only when project-specific log routing is needed.

1. Implement a custom class extending `Machine`.
2. Point `XSBUG_LOGMACHINE` to that module path.
3. Keep raw log file output enabled for auditability.

Do not modify SDK tools for this mode; use the documented plugin hook only.

## Produce Triage Output

Return a short incident summary with:

1. First failing signature line.
2. Related subsystem tag (`UI`, `NET`, `AUDIO`, `TEST`).
3. Reproduction command.
4. Suspected root cause.
5. Next verification step.
