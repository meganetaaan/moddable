# piu-next (experimental)

`piu-next` is a zero-based redesign track for embedded UI in Moddable.

Current scope:

- Signal-first reactivity core (`createSignal`, `createComputed`, `effect`)
- Batched updates (`batch`) to reduce redundant rerenders
- Typed ref handle API (`createRef`, `attachRef`, `detachRef`) as an `anchor` replacement base
- TSX transpile target to a compact IR (`node`, `fragment`, `text`)
- Piu runtime (`mountPiuApplication`) with typed `onTap`, ref wiring, queued reactive diff apply, and optional native runtime driver hook (`setNativeRuntimeDriver`)
- Tween animation utility (`tweenSignal`, `easings`) with native driver hook (`setNativeTweenDriver`)
- Strict TypeScript with no `any` in public API
- Test-first workflow with Node test runner

## Run tests

```bash
npm test
```

## Run tap E2E on mcsim

```bash
npm run test:e2e
```

This runs `testmc` with `tools/testmc/manifest_piu_next.json`, launches mcsim, and executes tap-driven tests in `tests/e2e`.
E2E tests run one-per-process to avoid simulator state leakage between cases.

## Run perf comparison (baseline vs piu-next)

```bash
npm run test:perf
```

This generates `dist/perf-report.json` with baseline/piu-next touch-path instrumentation and ratio thresholds.

## Sample app

`examples/counter-app` demonstrates:

- TSX declarative UI
- signal/computed state updates
- typed ref usage
- tap event handling
- tween animation

Build sample:

```bash
cd examples/counter-app
npm run build
```

Build for Linux simulator:

```bash
mcconfig -d -m -p lin -t build
```

## Notes

- This package is experimental and does not guarantee backward compatibility.
- TSX support is transpile-first (`jsxFactory: node`, `jsxFragmentFactory: fragment`).
- No standalone JSX runtime package is introduced.
- Runtime updates are queued through `taskQueue` to avoid touch-path reentrancy issues on constrained targets.
