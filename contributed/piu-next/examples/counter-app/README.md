# piu-next counter-app

TypeScript/TSX + signal + ref + animation sample for `piu-next`.
`src/main.ts` is the runnable entrypoint for mcconfig, and `src/mainView.tsx` is the TSX-form canonical sample.

## Build

```bash
npm run build
```
This runs `mcconfig` directly. No separate `tsc` pre-build step is required.
The manifest includes `$(MODDABLE)/examples/manifest_typings.json` for typings.
The sample enables the reference runtime/tween driver path by default and can switch to host-native bridges when provided.

## Run on mcsim (Linux)

```bash
npm run sim:run
```

For build-only verification:

```bash
npm run sim:build
```
