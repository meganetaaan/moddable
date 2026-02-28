/*
 * Copyright (c) 2022-2023  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Tools.
 * 
 *   The Moddable SDK Tools is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 * 
 *   The Moddable SDK Tools is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 * 
 *   You should have received a copy of the GNU General Public License
 *   along with the Moddable SDK Tools.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

let net, exec, LogMachine;

try {
	net = require('node:net');
	exec = require('node:child_process').exec;
	if (process.env.XSBUG_LOGMACHINE)
		LogMachine = require(process.env.XSBUG_LOGMACHINE).LogMachine;
	else
		LogMachine = require('./xsbug-logmachine.js').LogMachine;
}
catch (e) {
	if ("MODULE_NOT_FOUND" === e.code) {
		console.log("#xsbug-log missing modules! Did you npm install?");
		console.log("   cd $MODDABLE/tools/xsbug-log");
		console.log("   npm install");
	}
	else
		console.log("#xsbug-log start-up error: " + e);
	process.exit();
}

const portIn = process.env.XSBUG_LOG_PORT ?? 5002;
let connections = 0;
let autoexit = false;
const parsed = parseArguments(process.argv.slice(2));

function parseChannels(raw) {
	if (!raw)
		return undefined;
	const values = raw.split(",").map(value => value.trim()).filter(Boolean);
	return values.length ? values : undefined;
}

function parseArguments(args) {
	const options = {
		channel: parseChannels(process.env.XSBUG_LOG_CHANNELS),
		exclude: parseChannels(process.env.XSBUG_LOG_EXCLUDE),
		format: process.env.XSBUG_LOG_FORMAT ?? "text",
		strictChannel: false
	};

	let index = 0;
	while (index < args.length) {
		const argument = args[index];
		if ("--" === argument) {
			index++;
			break;
		}
		if (!argument.startsWith("--"))
			break;

		switch (argument) {
		case "--channel":
			index++;
			options.channel = parseChannels(args[index]);
			break;
		case "--exclude":
			index++;
			options.exclude = parseChannels(args[index]);
			break;
		case "--format":
			index++;
			options.format = args[index] ?? "text";
			break;
		case "--strict-channel":
			options.strictChannel = true;
			break;
		default:
			console.log(`#xsbug-log unknown option: ${argument}`);
			process.exit(1);
		}
		index++;
	}

	if ((options.format !== "text") && (options.format !== "jsonl")) {
		console.log(`#xsbug-log unsupported format: ${options.format}`);
		process.exit(1);
	}

	return {
		options,
		command: args.slice(index)
	};
}

let probe = net.connect({
	port: portIn,
	host: "127.0.0.1"
});
probe.setEncoding("utf8");
probe.on('ready', data => {
	console.log(`#xsbug-log: Debugger detected running on port ${portIn}. Please quit xsbug and try again.`);
	process.exit(-1);
});
probe.on('error', error => {
	// no debugger detected. continue.
	probe.destroy();
	launch();
});

function launch() {
	const server = net.createServer(target => { 
		connections++;
		target.setEncoding("utf8");
		target.on('end', () => {
			if (target.machine.title && ("mcsim" !== target.machine.title))
				console.log(`#xsbug-log disconnected from "${target.machine.title}"`);
			if ((0 === --connections) && autoexit)
				process.exit(0);
		});

		target.machine = new LogMachine(target, target, parsed.options);
	});

	server.listen(portIn, () => { 
	   console.log(`#xsbug-log listening on port ${portIn}. ^C to exit.`);
	});

	if (0 === parsed.command.length) {
		console.log("#xsbug-log: no command line arguments. Waiting for connection.");
		return;
	}

	let command = parsed.command[0];
	for (let i = 1; i < parsed.command.length; i++)
		command += ` ${parsed.command[i]}`;

	exec(command);
}
