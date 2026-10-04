# M5Stack Tab5 Diagnostics

Copyright 2026 Moddable Tech, Inc.<BR>
Revised: August 16, 2026

This example provides one touch-driven dashboard for exercising the Moddable APIs exposed by the M5Stack Tab5 target.
It reports each result on the display and through `trace()` for use with xsdb.
Results are held in RAM only and are reset whenever the application restarts.

## Build and run

Set up the Moddable SDK and ESP-IDF environment, then run:

```shell
cd $MODDABLE/examples/piu/tab5-diagnostics
mcconfig -dl -m -p esp32/m5stack_tab5
```

Pass Wi-Fi credentials only as build arguments when the connection test is required:

```shell
mcconfig -dl -m -p esp32/m5stack_tab5 wifiSSID="YOUR_SSID" wifiPassword="YOUR_PASSWORD"
```

The credentials are not stored in this example's source or manifest.
Without both arguments, the Wi-Fi page performs a scan and waits for manual acceptance.
The distinct names prevent the common network bootstrap from connecting before the diagnostic page is opened.

The status values are:

- `NOT RUN`: the page has not been opened.
- `RUNNING`: an automatic test is active.
- `WAIT`: external wiring, user observation, or confirmation is required.
- `PASS`: the automatic checks or requested manual checks passed.
- `FAIL`: an exception, data mismatch, or manual failure was reported.

Tap `‹ BACK` to leave a page.
The app closes page-owned I/O objects and restores brightness or power-gate settings when leaving.

## On-board diagnostics

- **Display** cycles red, green, blue, white, black, and an 80-pixel grid at 10%, 50%, and 100% backlight brightness.
- **5-point Touch** passes after five simultaneous contacts have been observed.
- **Camera** previews disposable RGB565 frames using the target rotation and shows the dimensions, byte length, and frame count.
  Confirm upright orientation, neutral color, and tear-free updates separately.
- **Audio** displays independent ES7210 microphone levels and plays a one-second, low-volume 1 kHz tone through ES8388.
  It also displays the headphone-detect state.
- **Wi-Fi** uses the ECMA-419 interface to scan and, when configured, connect to the requested access point.
- **RTC + Sensors** checks that RX8130CE time advances and that BMI270 and INA226 return finite live values.
- **microSD** creates a unique 4 KiB file, writes and compares its contents, then confirms deletion.
- **USB HID** can reopen the USB-A host in mouse or keyboard boot-protocol mode and displays each raw report.
- **Power** shows charge and headphone inputs, exercises the named output gates, and restores their original values.

Camera, display, audio, USB HID, and power-output quality require human observation.
The app does not infer a visual or acoustic pass from successful driver construction.

## External wiring

Disconnect power before changing wiring.
The loopback tests drive only the named Tab5 endpoints.

| Page | Wiring or peer | Test settings |
| --- | --- | --- |
| Port A I2C | Connect an I2C peripheral to G53 SDA, G54 SCL, 3V3, and GND | Address-only asynchronous scan, 0x08 through 0x77 |
| Port B G52→G17 | Jumper G52 output directly to G17 analog input | Drives low, then 3.3 V high |
| Port C UART | Jumper G6 TX directly to G7 RX | 115200 baud, 8N1 |
| M-Bus SPI | Jumper G18 MOSI directly to G19 MISO | G5 clock, 1 MHz, mode 0, no chip select |
| RS-485 | Connect A, B, and GND to an external echo peer | 115200 baud, 8N1 |

Port A scanning is asynchronous so missing addresses do not block touch or display updates.
An empty I2C scan is reported as `WAIT`, because no attached device can also be a valid setup.
The serial and SPI pages compare a fixed binary pattern rather than printable text alone.

## Power outputs

The Power page briefly inverts each of these configured states and restores it after 500 ms:

- external 5 V
- USB 5 V
- battery charge enable
- quick-charge enable
- external Wi-Fi antenna selection

Confirm the effects using the appropriate external load or measuring equipment, then select `PASS` or `FAIL`.
The Wi-Fi and Audio pages separately enable and restore the Wi-Fi and speaker gates while exercising those peripherals.

## RTC wake test

Run **RTC Wake last**.
It is intentionally destructive to the current diagnostic session:

1. Open RTC Wake and tap `Arm 30 s`.
2. Tap `POWER OFF` to configure `{alarm: 0, timer: 30000}` and request board power-off.
3. Observe whether the dashboard starts again after approximately 30 seconds.

The application clears a stale countdown-timer enable and flag at every boot, preventing an already-fired timer from remaining armed.
No result survives the restart, so wake success must be confirmed by observation.
USB power may keep part of the board or display powered while the power controller cycles the main rail.

## Capability-only entries

The Tab5 provider also exports `DigitalBank`, `PWM`, `PulseWidth`, and `PulseCount`.
They are listed on the Capabilities page but are not electrically tested because the target does not bind them to additional named endpoints.
The example does not guess pins, fixtures, or signal routing.
