# M5Stack StopWatch

Target: `esp32/m5stack_stopwatch` · ESP32-S3R8 · 16 MB flash · 8 MB octal PSRAM

## Build

With the Moddable ESP32 toolchain configured, build the basic interaction example:

```sh
cd $MODDABLE/examples/devices/m5stack-stopwatch
mcconfig -m -p esp32/m5stack_stopwatch -t build
```

This builds without flashing. Review the partition precautions below before deployment.

## Device APIs

| Feature | Interface | Notes |
| --- | --- | --- |
| Display | Target screen / Poco | CO5300 QSPI, 466 × 466, RGB565BE |
| Touch | `device.sensor.Touch` | CST820 or automatically detected CST9217 |
| Buttons | `device.peripheral.button.A`, `.B` | Active-low physical buttons |
| Motion | `device.sensor.IMU` | BMI270 accelerometer and gyroscope |
| Audio | `device.audio.Input`, `.Output`, `.Output.Async` | Concurrent input/output; 16 kHz, mono, signed 16-bit |
| RTC | `device.rtc` constructor descriptor | RX8130; UTC milliseconds and minute-resolution alarms |
| Vibration | `device.peripheral.Vibration` | `write(0|1)` and `close()` |

Touch coordinates default to the full 466-pixel range. For CST820 firmware reporting a half-resolution range, pass `coordinateScale: 2` to the touch constructor. Do not apply this scale unconditionally.

M5PM1, M5IOE1, ES8311, CST820 and RX8130 drivers use ECMA-419 IO interfaces. M5IOE1 pin numbers are 1-based expander pins, not MCU GPIO numbers. Board startup sequences the display rail and disables motor PWM and speaker gates before use.

### Audio

Use the board's `device.audio` constructors: direct audio IO imports bypass codec and amplifier sequencing. The board provider shares the codec and I2S clocks so either direction can stop, close and reopen while its peer continues. Use the supported 16 kHz mono, 16-bit format. Full duplex does **not** provide acoustic echo cancellation.

Set `output.volume` from 0 to 1; the basic example chooses 0.5. Keep PCM within its signed 16-bit range, and avoid an accidental second software gain multiplier. Precompute repeating audio data rather than performing expensive per-sample calculations inside a writable callback. See [duplex ownership and testing](m5stack-stopwatch-duplex.md).

### RTC and power

RTC time is undefined when the oscillator/voltage-low validity flag indicates invalid time. Set actual UTC before scheduling; no arbitrary default date is supplied. Alarms round up to the next minute and must be less than 28 days ahead. Setting the clock cancels an existing alarm.

The [RTC example](../../examples/devices/m5stack-stopwatch-rtc/readme.md) demonstrates explicit arming, awake interrupt verification and guarded PM1 power-off with RTC wake. This is not ESP32 deep sleep. The shared RTC/IMU interrupt must be inactive before shutdown. PM1 power-source bits describe VIN, VINOUT and the VBAT node; multiple bits may be set.

## Flash safety

The target's generic partition table is for a fresh installation and may differ from the factory OTA layout. **Do not overwrite a factory partition table using generated flash arguments without checking it.** Read the device's partition table and OTA metadata, identify the active application slot, and back up every erase-sector range that will be overwritten. Use the verified application address for an app-only update; do not assume another device's offset. Preserve the bootloader, OTA metadata, NVS and storage unless intentionally replacing them with a verified recovery plan.

To enter download mode, hold the power button until the green LED flashes, then release.

The target disables PHY calibration persistence and fails closed on NVS initialization errors rather than invoking the generic erase fallback. The Wi-Fi driver uses RAM configuration. Applications can still explicitly write preferences or other persistent storage; these precautions are not a general prohibition on flash writes.

## Validation and limits

Hardware bring-up exercised display/touch, buttons, vibration, IMU sampling, microphone capture and speaker playback. Short duplex lifecycle tests covered peer stop/close/reopen and callback-triggered input close. An RTC alarm asserted its flag and the shared PM1 interrupt; a separate battery-only test observed power-off followed by an unprompted alarm wake.

Wireless validation covered Wi-Fi scanning, association to a reachable 2.4 GHz network, DHCP, DNS, HTTP and HTTPS with certificate verification enabled. The [BLE example and browser client](../../examples/devices/m5stack-stopwatch-ble/web/README.md) build and pass host-side mocks; end-to-end phone GATT acceptance remains pending.

These observations do not establish factory firmware parity, calibrated audio fidelity, AEC, long-run heap/race stability, wireless throughput, repeated wake reliability or standby current. Validation on the original bring-up checkout must be repeated for release-branch ports and other board revisions.

## References

- [Official StopWatch documentation](https://docs.m5stack.com/en/core/StopWatch)
- [Factory speaker gate sequencing](https://github.com/m5stack/M5StopWatch-UserDemo/blob/81099c784991dc77f522de1a5bf62ec5de9ae0b5/main/hal/hal_ioe.cpp#L108-L121)
- [Official Main VA schematic](https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/1242/C152-SCH_Stopwatch_PRJ_Main_VA_20251201_2026_04_24_17_46_22.pdf)
- [M5GFX board definitions](https://github.com/m5stack/M5GFX/tree/master/src/board_detect/m5)
- [M5Unified PM1 power-source bitmap](https://github.com/m5stack/M5Unified/blob/96576a14247ddc935149145aa6b51943464120f1/src/utility/power/M5PM1_Class.hpp)
- [M5IOE1](https://github.com/m5stack/M5IOE1) / [M5PM1](https://github.com/m5stack/M5PM1)
