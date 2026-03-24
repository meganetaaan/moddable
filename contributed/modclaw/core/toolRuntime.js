import {CronScheduler} from "./cron.js";
import {MemoryStore} from "./memory.js";
import {
	getPersona,
	resetPersona,
	setPersona,
} from "./persona.js";
import {BUILTIN_TOOLS} from "./tools.js";
import {UserToolRegistry} from "./userTools.js";

const EMPTY_SCHEMA_JSON = "{\"type\":\"object\",\"properties\":{}}";

function builtinToolDefinitions() {
	return BUILTIN_TOOLS.map(tool => ({
		name: tool.name,
		description: tool.description,
		inputSchemaJson: JSON.stringify(tool.inputSchema),
	}));
}

function normalizedUserTool(tool) {
	return {
		name: tool.name,
		description: tool.description,
		action: tool.action,
		inputSchemaJson: EMPTY_SCHEMA_JSON,
	};
}

function requireInteger(value, name) {
	if (!Number.isInteger(value))
		throw new Error(`Error: '${name}' required (number)`);
}

function isoLocalText(date) {
	const value = new Date(date.valueOf());
	return value.toISOString();
}

export class ToolRuntime {
	constructor(options = {}) {
		this.memoryStore = options.memoryStore ?? new MemoryStore(new Map);
		this.personaStore = options.personaStore ?? new Map;
		this.cronScheduler = options.cronScheduler ?? new CronScheduler;
		this.userTools = options.userTools ?? new UserToolRegistry;
		this.hardware = options.hardware ?? {};
		this.system = {
			version: options.system?.version ?? "dev",
			diagnostics: options.system?.diagnostics ?? (() => "Diagnostics unavailable"),
			health: options.system?.health ?? (() => "Health unavailable"),
			now: options.system?.now ?? (() => new Date()),
			timeSynced: options.system?.timeSynced ?? (() => true),
		};
	}

	list() {
		return builtinToolDefinitions().concat(this.userTools.getAll().map(normalizedUserTool));
	}

	findUserTool(name) {
		return this.userTools.find(name);
	}

	execute(name, input = {}) {
		try {
			switch (name) {
				case "gpio_write":
					return this.hardware.gpioWrite?.(input) ?? {ok: false, text: "Error: gpio_write not implemented"};
				case "gpio_read":
					return this.hardware.gpioRead?.(input) ?? {ok: false, text: "Error: gpio_read not implemented"};
				case "gpio_read_all":
					return this.hardware.gpioReadAll?.(input) ?? {ok: false, text: "Error: gpio_read_all not implemented"};
				case "delay":
					return this.hardware.delay?.(input) ?? {ok: true, text: `Delayed ${input.milliseconds ?? 0} ms`};
				case "i2c_scan":
					return this.hardware.i2cScan?.(input) ?? {ok: false, text: "Error: i2c_scan not implemented"};

				case "memory_set":
					return {ok: true, text: this.memoryStore.set(input.key, input.value)};
				case "memory_get":
					return {ok: true, text: this.memoryStore.get(input.key)};
				case "memory_list":
					return {ok: true, text: this.memoryStore.list()};
				case "memory_delete":
					return {ok: true, text: this.memoryStore.delete(input.key)};

				case "set_persona": {
					const result = setPersona(this.personaStore, input.persona);
					return {ok: result.ok, text: result.message};
				}
				case "get_persona": {
					const result = getPersona(this.personaStore);
					return {ok: result.ok, text: result.message};
				}
				case "reset_persona": {
					const result = resetPersona(this.personaStore);
					return {ok: result.ok, text: result.message};
				}

				case "cron_set":
					return this.#cronSet(input);
				case "cron_list":
					return {ok: true, text: JSON.stringify(this.cronScheduler.list())};
				case "cron_delete":
					requireInteger(input.id, "id");
					return this.cronScheduler.delete(input.id)
						? {ok: true, text: `Deleted schedule #${input.id}`}
						: {ok: true, text: `Schedule #${input.id} not found`};

				case "get_time":
					return this.#getTime();
				case "set_timezone":
					return this.#setTimezone(input);
				case "get_timezone":
					return {ok: true, text: `Timezone: ${this.cronScheduler.getTimezone()} (${this.cronScheduler.getTimezoneAbbrev()})`};

				case "get_version":
					return {ok: true, text: String(this.system.version)};
				case "get_health":
					return {ok: true, text: String(this.system.health(input))};
				case "get_diagnostics":
					return {ok: true, text: String(this.system.diagnostics(input))};

				case "create_tool":
					if (this.userTools.create(input.name, input.description, input.action))
						return {ok: true, text: `Created tool '${input.name}': ${input.description}`};
					return {ok: false, text: "Error: failed to create tool (duplicate or limit reached)"};
				case "list_user_tools":
					return {ok: true, text: this.userTools.listText()};
				case "delete_user_tool":
					return this.userTools.delete(input.name)
						? {ok: true, text: `Deleted tool '${input.name}'`}
						: {ok: true, text: `Tool '${input.name}' not found`};
			}
		}
		catch (error) {
			return {ok: false, text: error.message};
		}

		return {ok: false, text: `Error: unknown tool '${name}'`};
	}

	#cronSet(input) {
		if ("string" !== typeof input.type)
			return {ok: false, text: "Error: 'type' required (periodic/daily/once)"};
		if ("string" !== typeof input.action)
			return {ok: false, text: "Error: 'action' required (what to do)"};

		let id = 0;
		switch (input.type) {
			case "periodic":
				requireInteger(input.interval_minutes, "interval_minutes");
				id = this.cronScheduler.create({
					type: "periodic",
					intervalMinutes: input.interval_minutes,
					action: input.action,
				});
				if (!id)
					return {ok: false, text: "Error: no free schedule slots"};
				return {ok: true, text: `Created schedule #${id}: every ${input.interval_minutes} min → ${input.action}`};
			case "daily":
				requireInteger(input.hour, "hour");
				id = this.cronScheduler.create({
					type: "daily",
					hour: input.hour,
					minute: input.minute ?? 0,
					action: input.action,
				});
				if (!id)
					return {ok: false, text: "Error: no free schedule slots"};
				return {
					ok: true,
					text: `Created schedule #${id}: daily at ${String(input.hour).padStart(2, "0")}:${String(input.minute ?? 0).padStart(2, "0")} ${this.cronScheduler.getTimezoneAbbrev()} → ${input.action}`,
				};
			case "once":
				requireInteger(input.delay_minutes, "delay_minutes");
				id = this.cronScheduler.create({
					type: "once",
					delayMinutes: input.delay_minutes,
					action: input.action,
				});
				if (!id)
					return {ok: false, text: "Error: no free schedule slots"};
				return {ok: true, text: `Created schedule #${id}: once in ${input.delay_minutes} min → ${input.action}`};
		}

		return {ok: false, text: "Error: type must be 'periodic', 'daily', or 'once'"};
	}

	#getTime() {
		const now = this.system.now();
		const timezone = this.cronScheduler.getTimezone();
		const abbrev = this.cronScheduler.getTimezoneAbbrev();
		if (this.system.timeSynced())
			return {ok: true, text: `${isoLocalText(now)} ${abbrev} (TZ=${timezone})`};
		return {ok: true, text: `Time not synced (no NTP). Configured TZ=${timezone} (${abbrev})`};
	}

	#setTimezone(input) {
		if ("string" !== typeof input.timezone)
			return {ok: false, text: "Error: 'timezone' required (string)"};
		const result = this.cronScheduler.setTimezone(input.timezone);
		if (!result.ok)
			return {ok: false, text: result.error ?? "Error: failed to set timezone"};
		const abbrev = this.cronScheduler.getTimezoneAbbrev();
		if (this.system.timeSynced())
			return {ok: true, text: `Timezone set to ${result.value} (${abbrev}). Current local time: ${isoLocalText(this.system.now())} ${abbrev}`};
		return {ok: true, text: `Timezone set to ${result.value} (${abbrev}). Time not synced yet (NTP pending).`};
	}
}
