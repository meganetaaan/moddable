# zclaw for Moddable

This directory contains the current Moddable port of `zclaw`, split into a pure-JS core,
async service adapters, and a live Moddable runtime entrypoint.

Implemented so far:

- synchronous agent runtime and conversation history for xst
- asynchronous `processMessageAsync()` runtime path for device/network adapters
- slash/admin command parsing helpers
- boot guard, rate limit, text buffer, and security helper logic
- cron validation, timezone alias resolution, and scheduler semantics
- LLM auth and WiFi credential helpers
- local admin command handling
- persistent memory key validation and in-memory store semantics
- `Preference`-compatible map adapter plus persisted cron and user-tool registries
- persona state helpers and system prompt composition
- Telegram token/chat-id/update/poll-policy helpers
- async HTTP gate, LLM service, and Telegram polling/send service layers
- built-in tool metadata and user-tool registry logic
- provider request/response shaping for Anthropic and OpenAI-like backends
- managed runtime wiring that combines storage, cron, tools, LLM, and Telegram
- live Moddable app startup in [`main.js`](/home/sskw/.local/share/moddable/contributed/zclaw/main.js)
- live boot-count handling, safe-mode gating, Wi-Fi connect/status/scan, and local admin hooks

The `xst` runner covers the pure modules, async service orchestration with fake transports,
and the public `modules/*` surface. Actual device I/O uses the live adapters under
`modules/liveApp.js`, `modules/requestTransport.js`, and `modules/wifiService.js`.

M5Stack CoreS3 sample app:

- source: [`examples/m5stack_cores3/main.js`](/home/sskw/.local/share/moddable/contributed/zclaw/examples/m5stack_cores3/main.js)
- manifest: [`examples/m5stack_cores3/manifest.json`](/home/sskw/.local/share/moddable/contributed/zclaw/examples/m5stack_cores3/manifest.json)
- build:

```sh
cd $MODDABLE/contributed/zclaw/examples/m5stack_cores3
mcconfig -d -m -p esp32/m5stack_cores3
```

Run the suite with:

```sh
$MODDABLE/build/bin/lin/debug/xst -m $MODDABLE/contributed/zclaw/tests/run.js
$MODDABLE/build/bin/lin/release/xst -m $MODDABLE/contributed/zclaw/tests/run.js
```
