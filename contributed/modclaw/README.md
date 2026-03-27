# modclaw for Moddable

This directory contains the current Moddable port of `modclaw`, split into a pure-JS core,
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
- Slack user-id parsing plus DM polling/send service layers
- async HTTP gate, LLM service, Telegram polling/send, and Slack polling/send service layers
- built-in tool metadata and user-tool registry logic
- provider request/response shaping for Anthropic and OpenAI-like backends
- managed runtime wiring that combines storage, cron, tools, LLM, Telegram, and Slack
- live Moddable app startup in [`main.js`](/home/sskw/.local/share/moddable/contributed/modclaw/main.js)
- live boot-count handling, safe-mode gating, Wi-Fi connect/status/scan, and local admin hooks

The `xst` runner covers the pure modules, async service orchestration with fake transports,
and the public `modules/*` surface. Actual device I/O uses the live adapters under
`modules/liveApp.js`, `modules/requestTransport.js`, and `modules/wifiService.js`.
`modclaw` now uses the ECMA-419 TCP/HTTP/TLS stack on every target; the older
`Request`/`SecureSocket` path is no longer used.

M5Stack CoreS3 sample app:

- source: [`examples/m5stack_cores3/main.js`](/home/sskw/.local/share/moddable/contributed/modclaw/examples/m5stack_cores3/main.js)
- manifest: [`examples/m5stack_cores3/manifest.json`](/home/sskw/.local/share/moddable/contributed/modclaw/examples/m5stack_cores3/manifest.json)
- build:

```sh
cd $MODDABLE/contributed/modclaw/examples/m5stack_cores3
mcconfig -d -m -p esp32/m5stack_cores3
```

Linux simulator sample app:

- source: [`examples/lin/main.js`](/home/sskw/.local/share/moddable/contributed/modclaw/examples/lin/main.js)
- manifest: [`examples/lin/manifest.json`](/home/sskw/.local/share/moddable/contributed/modclaw/examples/lin/manifest.json)
- build and run:

```sh
cd $MODDABLE/contributed/modclaw/examples/lin
mcconfig -d -m -p lin openAIKey="$OPENAI_API_KEY"
```

The `lin` wrapper seeds the Moddable `Preference` store from `mc/config`, defaults
`wifiSSID` to `lin-sim`, treats `openAIKey` as an OpenAI backend API key, and resets
`boot_count` on startup so simulator crash loops do not leave the app stuck in safe mode.
Pass `preserveBootCount=1` if you want to test safe-mode behavior. You can override
additional persisted values on the command line, for example:

```sh
mcconfig -d -m -p lin openAIKey="$OPENAI_API_KEY" wifiSSID="JAMS2" wifiPassword="secret"
```

Telegram can also be seeded directly:

```sh
mcconfig -d -m -p lin \
  openAIKey="$OPENAI_API_KEY" \
  telegramToken="$TELEGRAM_BOT_TOKEN" \
  telegramChatId="$TELEGRAM_CHAT_ID"
```

Slack support is DM-only in this build. The bot polls direct-message conversations for an
allowlist of Slack user IDs and replies into the same DM. Seed Slack settings like this:

```sh
mcconfig -d -m -p lin \
  openAIKey="$OPENAI_API_KEY" \
  slackToken="$SLACK_BOT_TOKEN" \
  slackUserIds="U12345678,U23456789"
```

The Slack app should grant at least these bot scopes:

- `im:read`
- `im:history`
- `chat:write`

This polling design assumes an internal or customer-built Slack app. Slack's
`conversations.history` limits are stricter for newly distributed non-Marketplace commercial apps.

Run the suite with:

```sh
$MODDABLE/build/bin/lin/debug/xst -m $MODDABLE/contributed/modclaw/tests/run.js
$MODDABLE/build/bin/lin/release/xst -m $MODDABLE/contributed/modclaw/tests/run.js
```
