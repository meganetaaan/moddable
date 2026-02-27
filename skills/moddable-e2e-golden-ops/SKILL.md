---
name: moddable-e2e-golden-ops
description: Execute Moddable E2E and graphics regression workflows using existing tools only (testmc, screen.checkImage/checksum, mcconfig, and local helper scripts) without SDK tool modifications. Use when adding or updating golden data, validating Piu/Commodetto rendering, and triaging UI regressions.
---

# Moddable E2E Golden Ops

Use this skill to run E2E checks and maintain golden data with current tooling.

## Run E2E Build/Deploy/Debug in Separate Phases

Run build, deploy, and debug separately to reduce noise and isolate failures.

```bash
cd contributed/ai-e2e-scaffold
mcconfig manifests/manifest.e2e.json -d -m -p esp32/moddable_two -t build
mcconfig manifests/manifest.e2e.json -d -m -p esp32/moddable_two -t deploy
mcconfig manifests/manifest.e2e.json -dl -m -p esp32/moddable_two -t xsbug
```

Use `-dl` for runtime-focused logs on terminal.

## Validate Scenario Checksum

Use `screen.checkImage(...)` in scenario tests and compare with registered checksum.

Template scenario:
- `contributed/ai-e2e-scaffold/tests/e2e/scenarios/home.flow.template.js`

Checksum store:
- `contributed/ai-e2e-scaffold/tests/golden/checksums/rgb565le.json`

Verify checksum from terminal:

```bash
node contributed/ai-e2e-scaffold/tools/e2e/verify-golden.js \
  --scenario home --step step01 --actual <md5> --format rgb565le
```

## Update Golden Data

Update checksum and PNG together whenever UI changes intentionally.

```bash
node contributed/ai-e2e-scaffold/tools/e2e/update-golden.js \
  --scenario home --step step01 --checksum <md5> --format rgb565le
```

```bash
node contributed/ai-e2e-scaffold/tools/e2e/update-golden.js \
  --scenario home --step step01 --png <path/to/step01.png> --format rgb565le
```

## Golden Decision Rules

Apply the following rules before updating golden.

1. Confirm the change is intended behavior, not regression.
2. Update checksum and PNG in the same change set.
3. Keep scenario name and step name stable.
4. Review PNG diffs and checksum diffs together in PR.
5. Reject update when behavior intent is unclear.

## Produce Review Output

Report these items for each scenario.

1. Scenario and step IDs.
2. Old checksum and new checksum.
3. Linked PNG path.
4. Reason for update.
5. Pass/fail result after re-run.
