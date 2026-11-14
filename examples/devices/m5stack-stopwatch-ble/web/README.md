# StopWatch Web Bluetooth client

A dependency-free smartphone client for the StopWatch BLE example. It uses no external assets, telemetry or persistent browser storage. Device permission is requested only when the user presses **接続する**.

## Protocol

Select **StopWatch Demo**. The client requests service `f14d0001-5b63-4f40-9b19-080000000018`.

- Color characteristic `f14d0002-5b63-4f40-9b19-080000000018`: read/write three RGB bytes.
- State characteristic `f14d0003-5b63-4f40-9b19-080000000018`: read/notify `[1, sequence, red, green, blue, A_count, B_count]`.

State payloads must have version 1 and exactly seven bytes. Sequence and button counters wrap after 255. They are device counters, not a guarantee that every notification arrived. After disconnection the page labels displayed values as the last received state; it does not automatically reconnect.

## Run locally

Use a Web Bluetooth-capable browser such as modern Android Chrome in a secure context. HTTPS and localhost are suitable; plain HTTP at a computer's LAN address is not. iOS browsers are not the intended test platform.

Serve this directory on a computer's loopback interface:

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory <web-directory>
```

For an Android phone, an authorized USB-debugging connection can forward phone port 8080 to the computer's localhost:8080 through Chrome DevTools. Then open `http://localhost:8080` on the phone. Obtain the phone owner's debugging consent before enabling that facility. No firewall exception or certificate installation is needed for this path. Stop the server after testing.

An existing access-controlled HTTPS host with a certificate trusted by the phone is another option. Hosting is separate from this example; there is no automatic deployment.

See [Chrome Web Bluetooth requirements](https://developer.chrome.com/docs/capabilities/bluetooth) and [USB port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server).

## Verification

```sh
node test.mjs
```

Mocks cover payload validation, color writes, cancellation during discovery, concurrent-operation rejection, stale callbacks after disconnect and cleanup after notification failure. They do not establish physical Bluetooth interoperability.

Manual acceptance:

1. Page load must not open a chooser. Unsupported or insecure contexts disable connection.
2. Connect and select StopWatch Demo; verify initial RGB and button counts.
3. Select each color preset and compare the physical display with the returned RGB.
4. Press physical A/B and verify notifications update counts without a manual read.
5. Read state, cancel the chooser, disconnect during connection, power off the device and reconnect. Confirm no stale updates or duplicate listeners.
6. Leave the page or disconnect; controls must disable. Check counter wrap if exercised.

The client serializes GATT operations and scopes listeners to a connection attempt. End-to-end smartphone acceptance remains a separate hardware test.
