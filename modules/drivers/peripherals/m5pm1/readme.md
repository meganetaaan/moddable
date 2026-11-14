# M5PM1 power and wake control

This is an initial ECMA-419 SMBus driver. Wake/shutdown functionality has mock coverage only; it has not been tested on M5StopWatch hardware.

## API

- `configureWake({pin, edge: "falling" | "rising", enabled: true})`: configure an input wake pin. Supported pins are 0, 2, 3, 4. The driver disables the pin's wake function before changing it, clears its internal pull, selects WAKE mode, sets the edge, then enables it. Each masked write is read back. Other pins' settings are preserved.
- `verifyWake({pin, edge})`: verify direction, function, enable, edge and currently inactive line level.
- `status`: numeric `powerSource`, `wakeSource` flags and `inputs` bitmap. Reading does not clear wake evidence.
- `shutdown({wakePin, edge})`: require a configured, inactive wake input and VBAT-only source bitmap (4), then issue command 0xA1. It does not configure a sensor, verify an RTC, quiesce an application, or assert that shutdown/wake succeeded. The caller must complete those steps first. It is never retried automatically.

USB/5VIN bit 0, 5VINOUT bit 1, every combined external source, and no-source bitmap 0 are rejected. This is a conservative implementation restriction, not a claim that PM1 cannot shut down with USB attached. The official USB example waits for USB removal before shutdown and tests PM1 timer wake, not the StopWatch external RTC path.

## Proposed StopWatch integration (not installed)

StopWatch routes the shared RTC/IMU active-low signal to PM1 GPIO0. A future board helper should take ownership of the power transition, not place board-specific policy in this generic driver:

1. Require battery source and a valid RTC, with a deadline at least two minutes ahead.
2. Stop audio, display updates and sensor interrupt producers; retain the RTC and PM1 IO objects.
3. Configure GPIO0 falling-edge wake. Refuse an already asserted shared line; do not blindly clear unrelated IMU events.
4. Program `rtc.configure({alarm})` and require `rtc.verifyAlarm()`. This checks AIE, WADA, AF/VLF, actual comparator bytes and a still-future deadline against the instance's known absolute time.
5. Immediately recheck `power.verifyWake({pin: 0})`, RTC validity, deadline margin and `rtc.verifyAlarm()`.
6. Call `power.shutdown({wakePin: 0})` once. Treat an I2C error or a still-running MCU as an uncertain transition, not success; never automatically cancel the wake alarm after an uncertain shutdown request.
7. On reboot, record `power.status.wakeSource` before clearing anything, then disarm the RTC alarm. Do not automatically shut down again.

There is necessarily a race between separate I2C transactions and a future interrupt edge. Sufficient alarm lead time and a quiescent shared IRQ are prerequisites, not a proof of hardware wake. Validate the full path with externally observed power/current and a confirmed restart before enabling this helper in normal applications.

To receive RTC alarm events while awake, use deliberate board-level polling or a verified PM1-to-ESP interrupt routing implementation. Do not pretend PM1 GPIO0 is an ESP32 Digital pin. No polling timer is installed by these drivers.

## Sources

- [M5PM1 definitions](https://github.com/m5stack/M5PM1/blob/main/src/M5PM1.h)
- [Official USB removal / timer wake example](https://github.com/m5stack/M5PM1/blob/main/examples/usb_interrupt_sleep/usb_interrupt_sleep.ino)
- [StopWatch documentation and schematic](https://docs.m5stack.com/en/core/StopWatch)

Run `node modules/drivers/peripherals/m5pm1/wake.test.mjs` for the host-only safety tests.

### PM1 power-source bitmap correction

`powerSource` is a bitmap: VIN=1, VINOUT=2, VBAT node=4. Multiple rails can be present, so USB plus VBAT is 5. Host-time confirmation requires VIN bit 0; battery-only shutdown requires exactly 4, rejecting every external-rail combination. VBAT node validity alone does not prove physical battery presence. The earlier standalone M5PM1 enum incorrectly treated bit indices as exclusive values; do not use its 0/1/2 enum interpretation. The corrected upstream definition is [M5Unified M5PM1_Class.hpp](https://github.com/m5stack/M5Unified/blob/96576a14247ddc935149145aa6b51943464120f1/src/utility/power/M5PM1_Class.hpp#L65-L105).
