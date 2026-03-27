/*---
description:
flags: [module]
---*/

import {
	commandPayload,
	isCommand,
	isSlashCommand,
	parseDiagCommandArgs,
	parseGPIOCommandArgs,
} from "../../../contributed/modclaw/modules/commands.js";

assert.sameValue(true, isCommand("/start", "start"));
assert.sameValue(true, isCommand("  /start@lobster_bot hi", "start"));
assert.sameValue(false, isCommand("start", "start"));
assert.sameValue(false, isCommand("/startled", "start"));

assert.sameValue("hello there", commandPayload("/start hello there", "start"));
assert.sameValue("", commandPayload("/start", "start"));
assert.sameValue(null, commandPayload("/noop", "start"));

assert.sameValue(true, isSlashCommand(" /diag runtime"));
assert.sameValue(false, isSlashCommand("hello"));

let gpio = parseGPIOCommandArgs("/gpio");
assert.sameValue("gpio_read_all", gpio.toolName);

gpio = parseGPIOCommandArgs("/gpio all");
assert.sameValue("gpio_read_all", gpio.toolName);

gpio = parseGPIOCommandArgs("/gpio 4");
assert.sameValue("gpio_read", gpio.toolName);
assert.sameValue(4, gpio.input.pin);

gpio = parseGPIOCommandArgs("/gpio 4 high");
assert.sameValue("gpio_write", gpio.toolName);
assert.sameValue(4, gpio.input.pin);
assert.sameValue(1, gpio.input.state);

assert.throws(Error, () => parseGPIOCommandArgs("/gpio all now"));
assert.throws(Error, () => parseGPIOCommandArgs("/gpio abc"));

let diag = parseDiagCommandArgs("/diag");
assert.sameValue(undefined, diag.scope);
assert.sameValue(undefined, diag.verbose);

diag = parseDiagCommandArgs("/diag runtime verbose");
assert.sameValue("runtime", diag.scope);
assert.sameValue(true, diag.verbose);

assert.throws(Error, () => parseDiagCommandArgs("/diag strange"));
