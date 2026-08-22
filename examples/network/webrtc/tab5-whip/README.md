# Tab5 WHIP sample

This is a Moddable sample for `esp32/m5stack_tab5`. It uses the platform's
`embedded:network/interface/wifi` implementation, so the Tab5 board setup
(power rails, camera I2C, and C6 SDIO) runs before the H.264 capture path.

The native module is a thin binding to the `esp-webrtc-solution` WHIP client.
MediaMTX is only the receiving endpoint; no proprietary Sora license is
required.

## Build

Use ESP-IDF 6.0.2, then set the local ESP WebRTC checkout and credentials:

```sh
export MODDABLE=/home/sskw/.local/share/moddable-worktrees/m5stack-tab5-stack
# Use the current esp-webrtc-solution checkout (v1.2.0 is tied to esp_capture 0.7).
export ESP_WEBRTC_SOLUTION=/path/to/esp-webrtc-solution
export IDF_PATH=/home/sskw/.local/share/esp32/esp-idf-v6.0.2-stackchan-benchmark
export PATH="$MODDABLE/build/bin/lin/release:$PATH"
source "$IDF_PATH/export.sh"

cd "$MODDABLE/examples/network/webrtc/tab5-whip"
mcconfig -m -p esp32/m5stack_tab5 \
	"ssid=YOUR_SSID" \
	"password=YOUR_PASSWORD" \
	"whipURL=http://YOUR_MEDIAMTX_HOST:8889/tab5/whip"
```

For a MediaMTX instance on another host, replace the URL with that host's
address. `whipToken="user:password"` is optional when the endpoint uses
HTTP Basic authentication.

## Browser

Open the MediaMTX WebRTC page at
`http://YOUR_MEDIAMTX_HOST:8889/tab5/` after the device reports a WHIP connection.
The sample sends H.264 at 1280x720/30 fps and does not render local video.
The Tab5 display shows debug-only status (Wi-Fi state/IP, WHIP state/error,
target URL, and video format); camera frames are never rendered locally.
