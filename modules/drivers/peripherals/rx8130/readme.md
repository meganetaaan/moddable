# RX8130CE RTC

The driver uses ECMA-419 SMBus through the `clock` option. Time values are UTC milliseconds in 2000–2099. Invalid oscillator state, stopped counting, or corrupt calendar values return `undefined`.

## Alarm

`configure({alarm: timestamp})` programs minute, hour, and day-of-month comparators. The requested time must be later than the current valid RTC time. It is rounded **up** to the next whole minute, and the resulting deadline must be **less than 28 days** away. The strict limit prevents matching the same day/time in an earlier month, including February. Invalid requests leave the previous alarm intact.

`configure({alarm: 0})` disables AIE and clears only AF, preserving timer/voltage flags. A programming failure after the initial disable leaves AIE disabled; an I2C failure itself must not be treated as confirmed hardware state.

`configuration.alarm` returns the programmed, rounded deadline for this instance, or `0` when disabled. It returns `undefined` for an alarm inherited from another instance or a reboot: hardware does not retain its month/year, so the driver does not fabricate an absolute deadline.

An optional `interrupt` Digital descriptor and `onAlarm` callback support directly connected IRQ pins. The callback receives no arguments, with the RTC instance as `this`. It runs only for an enabled alarm with AF set; AIE is disabled and AF acknowledged before calling it.

`close()` releases IO handles but **does not cancel the hardware alarm**, so it can remain armed for power-off wake. Without the callback (including while powered off), the hardware comparator remains periodic by day-of-month. After wake, explicitly cancel the alarm before sleeping again. Setting `time` cancels any armed alarm and clears its pending flag before writing the calendar, including an alarm inherited from an earlier instance. This prevents a clock jump from changing the month/year implied by a day-of-month comparator. Invalid time arguments leave the alarm unchanged. On an I2C failure, the setter throws and invalidates the cached deadline; do not assume hardware cancellation succeeded. Set time first, then explicitly schedule a fresh alarm.

## M5StopWatch wake integration: not implemented or hardware-tested

The official schematic connects RTC nIRQ and the IMU interrupt network to **M5PM1 GPIO0**, not directly to an ESP32 GPIO. Do not configure an arbitrary ESP32 Digital pin as this RTC's interrupt. PM1 GPIO2 is charger status, not the RTC wake pin.

A future PM1 integration should:

1. Keep normal power on and stop audio/display work cleanly.
2. Confirm a valid RTC time, sufficient alarm lead time, and successful alarm register readback.
3. Configure PM1 GPIO0 for input/wake on the proper active-low transition, preserving other GPIO functions (especially GPIO3 charging-current selection).
4. Acknowledge stale RTC/IMU sources and verify the shared interrupt line is inactive before arming wake. A still-asserted IMU source can prevent a new falling edge.
5. Verify PM1 wake-enable configuration and wake-line state immediately before the power transition. Abort on any failed transaction or elapsed deadline.
6. Only then request the documented PM1 low-power mode. USB-connected, battery-only, ESP deep sleep, and power-cut modes require separate tests; an alarm register write alone does not prove wake support.
7. After restart, inspect wake cause before clearing it, acknowledge/disarm the RTC alarm, and restore normal power configuration.

No PM1 shutdown/wake writes or real-device tests were performed for this RTC change.

## Sources

- [M5Unified RX8130 implementation](https://github.com/m5stack/M5Unified/blob/master/src/utility/rtc/RX8130_Class.inl)
- [StopWatch documentation and schematic link](https://docs.m5stack.com/en/core/StopWatch)
- [M5PM1 register definitions](https://github.com/m5stack/M5PM1/blob/main/src/M5PM1.h)

## Host verification

Run `node modules/drivers/peripherals/rx8130/test.mjs` from the SDK checkout. The mock covers calendar bounds, month rollover, invalid-time rejection, rounding, unrelated IRQ preservation, failed alarm writes, callback one-shot behavior, and keeping the hardware alarm armed across close. It does not verify physical IRQ wiring or power-off wake.
