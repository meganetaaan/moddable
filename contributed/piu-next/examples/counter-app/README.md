# piu-next counter-app

TypeScript + signal + ref + animation sample for `piu-next`.

## Build

```bash
npm run build
```
This runs `mcconfig` directly. No separate `tsc` pre-build step is required.
The manifest includes `$(MODDABLE)/examples/manifest_typings.json` for typings.

## Run on mcsim (Linux)

```bash
npm run sim:run
```

For build-only verification:

```bash
npm run sim:build
```
