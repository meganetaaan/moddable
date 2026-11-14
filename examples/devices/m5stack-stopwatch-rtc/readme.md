# StopWatch RTC alarm and power-off example

This example uses the RX8130 RTC and M5PM1 power controller. It never enters low power automatically. A arms an alarm; B requests power-off only after safety checks. Use a release build for a standalone battery wake test so execution does not depend on a debugger.

```sh
mcconfig -m -p esp32/m5stack_stopwatch -t build
```

Review the [factory partition and backup precautions](../../../documentation/devices/m5stack-stopwatch.md#flash-safety) before flashing.

## Clock setup

An invalid RTC is not replaced with a build date or arbitrary timestamp. First synchronize the system clock from an actual host clock using the SDK debugger. While paused in an initialized application frame, evaluate `globalThis.rtcTest.confirmHostTime(hostUTC)` with a freshly sampled UTC timestamp in milliseconds, then resume and press A within 60 seconds. The timestamp must be within five seconds of the device system clock, and VIN must be present. A initializes only an invalid RTC and checks its readback; an already valid RTC is never overwritten.

For a debugger-driven awake-only test, `globalThis.rtcTest.syncAndArm(hostUTC)` performs the same fresh-host check and arming path, returning the deadline or throwing. It does not request power-off. Resume execution to allow polling. These hooks are diagnostic interfaces, not network time synchronization or authentication mechanisms.

Host debugger time has whole-second precision plus transport delay. Inspect the confirmation delta and RTC readback; do not infer sub-millisecond accuracy.

## Controls and indication

- **Blue:** idle.
- **A / green:** schedule an alarm two minutes ahead, rounded up to the next minute. The resulting wait is approximately two to three minutes.
- **B / amber:** validate and request PM1 power-off once.
- **Purple:** an alarm was observed while awake, or its retained flag was present at boot before acknowledgment.

At boot, the example logs the original PM1 wake bitmap and RTC alarm status before disabling any previous alarm. Purple indicates retained alarm evidence, not independent proof of a wake cause. No automatic rearming or power-off loop occurs.

## Awake alarm test

Keep USB attached, arm with A or the diagnostic hook, and leave the application running. Check for `AWAKE ALARM flag=1 PM1_GPIO0_LOW=true`; the sample then acknowledges the flag. This checks the RTC comparator and shared interrupt path without requesting shutdown.

## Battery wake test

1. Start with valid RTC time. Press A and confirm green.
2. Disconnect USB and other external power, then press B.
3. Observe actual power-off and an unprompted return within the scheduled interval.
4. Inspect the display before reconnecting USB. Opening a serial connection or reconnecting power can itself reset the device and must not be mistaken for RTC wake.

B requires a valid clock, a matching future alarm with at least 30 seconds remaining, inactive shared RTC/IMU interrupt, verified wake configuration and VBAT-only power. Checks repeat before the final command. Application timers and IO handles are quiesced; the RTC alarm is retained for wake. A returned I2C acknowledgment alone does not prove power-off or restart.

PM1 power-source values are a bitmap: VIN=1, VINOUT=2, VBAT node=4. Host-time confirmation requires VIN; shutdown requires exactly 4. VBAT node validity does not by itself prove physical battery presence. See the [upstream bitmap definition](https://github.com/m5stack/M5Unified/blob/96576a14247ddc935149145aa6b51943464120f1/src/utility/power/M5PM1_Class.hpp).

This is PM1-managed power-off with a retained RTC, not ESP32 deep sleep. Standby current and repeated-cycle reliability must be measured separately.

## Host tests

Run `node test.mjs` to exercise invalid-clock rejection, fresh-host confirmation, remote arming, external-power refusal, shared-IRQ checks, one-shot shutdown and boot indication. These mocks do not replace physical power-transition tests.
