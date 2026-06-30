#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createReadStream, statSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const PROTOCOL = "mctest/1";
const here = dirname(fileURLToPath(import.meta.url));
const moddableRoot = resolve(here, "../..");

function usage() {
	return `Usage: node runner.mjs run [options]

Targets:
  --target xst|mcsim|device       Backend to run. Default: xst

Common options:
  --reporter spec|json|junit      Report format. Default: spec
  --report-file <path>            Also write report to a file
  --no-stdout                     Do not print report to stdout
  --app-log none|stdout|stderr    Forward decoded app log text. Default: none
  --timeout-ms <ms>               Backend timeout. Default: 30000

xst options:
  --test <path>                   Module passed to xst -m
  --xst <path>                    xst executable

mcsim options:
  --manifest <path>               Manifest passed to mcconfig
  --platform <platform>           mcconfig platform. Default: lin/m5stack
  --mcconfig <path>               mcconfig executable
  --mcsim <path>                  mcsim executable
  --mc-so <path>                  Existing mc.so. Skips build
  --mcsim-mode full|minimal|headless
                                  mcsim UI mode. Default: minimal
  --headless                      Shortcut for --mcsim-mode headless
  --screenshot <path>             Ask mcsim to write one PNG after launch
  --no-xvfb                       Do not wrap mcsim in xvfb-run -a
  --dbus-run-session              Force dbus-run-session around mcsim
  --no-dbus-run-session           Do not isolate mcsim with dbus-run-session
  --debug-xsbug                   Print xsbug protocol chunks to stderr

device options:
  --input -|<path>                Read captured xsbug-log output
  --device-log-command <command>  Spawn an xsbug-log command and parse stdout
`;
}

function parseArgs(argv) {
	const args = [...argv];
	const command = args[0] && !args[0].startsWith("-") ? args.shift() : "run";
	const options = {
		command,
		target: "xst",
		reporter: "spec",
		stdout: true,
		appLog: "none",
		timeoutMs: 30_000,
		test: join(here, "xst-main.js"),
		manifest: join(here, "manifest.json"),
		platform: "lin/m5stack",
		mcsimMode: "minimal",
		useXvfb: true,
		useDbusRunSession: true,
	};

	function take(name) {
		const value = args.shift();
		if (!value)
			throw new Error(`${name} requires a value`);
		return value;
	}

	while (args.length) {
		const arg = args.shift();
		switch (arg) {
			case "--help":
			case "-h":
				options.help = true;
				break;
			case "--target":
				options.target = take(arg);
				break;
			case "--reporter":
			case "--format":
				options.reporter = take(arg);
				break;
			case "--report-file":
				options.reportFile = take(arg);
				break;
			case "--no-stdout":
				options.stdout = false;
				break;
			case "--app-log":
				options.appLog = take(arg);
				break;
			case "--timeout-ms":
				options.timeoutMs = Number(take(arg));
				break;
			case "--test":
				options.test = take(arg);
				break;
			case "--manifest":
				options.manifest = take(arg);
				break;
			case "--platform":
				options.platform = take(arg);
				break;
			case "--xst":
				options.xst = take(arg);
				break;
			case "--mcconfig":
				options.mcconfig = take(arg);
				break;
			case "--mcsim":
				options.mcsim = take(arg);
				break;
			case "--mc-so":
				options.mcSo = take(arg);
				break;
			case "--mcsim-mode":
				options.mcsimMode = take(arg);
				break;
			case "--headless":
				options.mcsimMode = "headless";
				break;
			case "--screenshot":
				options.screenshot = take(arg);
				break;
			case "--input":
				options.input = take(arg);
				break;
			case "--device-log-command":
				options.deviceLogCommand = take(arg);
				break;
			case "--no-xvfb":
				options.useXvfb = false;
				break;
			case "--dbus-run-session":
				options.useDbusRunSession = true;
				break;
			case "--no-dbus-run-session":
				options.useDbusRunSession = false;
				break;
			case "--debug-xsbug":
				options.debugXsbug = true;
				break;
			default:
				throw new Error(`unknown option: ${arg}`);
		}
	}

	if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
		throw new Error("--timeout-ms must be a positive number");
	if (!["full", "minimal", "headless"].includes(options.mcsimMode))
		throw new Error("--mcsim-mode must be full, minimal, or headless");
	if (!["none", "stdout", "stderr"].includes(options.appLog))
		throw new Error("--app-log must be none, stdout, or stderr");
	return options;
}

function xmlDecode(value) {
	return value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
		.replace(/&#10;/g, "\n")
		.replace(/&#13;/g, "\r")
		.replace(/&amp;/g, "&");
}

function parseEventLine(line) {
	const trimmed = line.trim();
	if (!trimmed || trimmed[0] !== "{")
		return null;
	try {
		const event = JSON.parse(trimmed);
		if (event.protocol === PROTOCOL && event.type)
			return event;
	}
	catch {
	}
	return null;
}

class EventCollector {
	events = [];
	#lineBuffer = "";
	#doneResolvers = [];
	#onLogText;

	constructor(options = {}) {
		this.#onLogText = options.onLogText;
	}

	add(event) {
		this.events.push(event);
		if (event.type === "run:done") {
			for (const resolve of this.#doneResolvers)
				resolve(event);
			this.#doneResolvers.length = 0;
		}
	}

	appendText(text) {
		this.#onLogText?.(text);
		this.#lineBuffer += text;
		let index;
		while ((index = this.#lineBuffer.indexOf("\n")) >= 0) {
			const line = this.#lineBuffer.slice(0, index);
			this.#lineBuffer = this.#lineBuffer.slice(index + 1);
			const event = parseEventLine(line);
			if (event)
				this.add(event);
		}
	}

	flush() {
		if (!this.#lineBuffer)
			return;
		const event = parseEventLine(this.#lineBuffer);
		if (event)
			this.add(event);
		this.#lineBuffer = "";
	}

	waitForDone(timeoutMs) {
		const existing = this.events.find(event => event.type === "run:done");
		if (existing)
			return Promise.resolve(existing);
		return new Promise((resolve, reject) => {
			const onDone = event => {
				clearTimeout(timer);
				resolve(event);
			};
			const timer = setTimeout(() => {
				const index = this.#doneResolvers.indexOf(onDone);
				if (index >= 0)
					this.#doneResolvers.splice(index, 1);
				reject(new Error(`timed out waiting for run:done after ${timeoutMs}ms`));
			}, timeoutMs);
			this.#doneResolvers.push(onDone);
		});
	}
}

function appLogWriter(options) {
	if (options.appLog === "stdout")
		return text => process.stdout.write(text);
	if (options.appLog === "stderr")
		return text => process.stderr.write(text);
	return undefined;
}

function summarize(events, fallbackName = "mctest") {
	const byName = new Map();
	let runDone;
	for (const event of events) {
		if (event.type === "run:done")
			runDone = event;
		if (event.type === "test:start") {
			byName.set(event.name, { name: event.name, status: "running", durationMs: 0 });
		}
		else if (event.type === "test:pass") {
			byName.set(event.name, { ...byName.get(event.name), name: event.name, status: "passed", durationMs: event.durationMs || 0 });
		}
		else if (event.type === "test:skip") {
			byName.set(event.name, { ...byName.get(event.name), name: event.name, status: "skipped", reason: event.reason, durationMs: event.durationMs || 0 });
		}
		else if (event.type === "test:fail") {
			byName.set(event.name, { ...byName.get(event.name), name: event.name, status: "failed", error: event.error, durationMs: event.durationMs || 0 });
		}
	}
	const tests = [...byName.values()];
	const failed = tests.filter(test => test.status === "failed").length;
	const skipped = tests.filter(test => test.status === "skipped").length;
	const passed = tests.filter(test => test.status === "passed").length;
	return {
		name: runDone?.name || fallbackName,
		complete: !!runDone,
		tests,
		passed: runDone?.passed ?? passed,
		failed: runDone?.failed ?? failed,
		skipped: runDone?.skipped ?? skipped,
		durationMs: runDone?.durationMs ?? tests.reduce((sum, test) => sum + (test.durationMs || 0), 0),
		rawEvents: events,
	};
}

function requireRunDone(result, target) {
	if (!result.complete)
		throw new Error(`${target} did not emit run:done`);
	return result;
}

function specReport(result) {
	const lines = [`${result.name}: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`];
	for (const test of result.tests) {
		if (test.status === "passed")
			lines.push(`PASS ${test.name}`);
		else if (test.status === "skipped")
			lines.push(`SKIP ${test.name}${test.reason ? ` - ${test.reason}` : ""}`);
		else if (test.status === "failed") {
			lines.push(`FAIL ${test.name}`);
			if (test.error?.message)
				lines.push(`  ${test.error.message}`);
		}
	}
	return lines.join("\n") + "\n";
}

function escapeXml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function cdata(value) {
	return String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
}

function junitReport(result) {
	const failures = result.failed;
	const skipped = result.skipped;
	const time = (result.durationMs / 1000).toFixed(3);
	const lines = [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<testsuite name="${escapeXml(result.name)}" tests="${result.tests.length}" failures="${failures}" skipped="${skipped}" time="${time}">`,
	];
	for (const test of result.tests) {
		const testTime = ((test.durationMs || 0) / 1000).toFixed(3);
		lines.push(`  <testcase classname="${escapeXml(result.name)}" name="${escapeXml(test.name)}" time="${testTime}">`);
		if (test.status === "failed") {
			const message = test.error?.message || "failed";
			const detail = test.error?.stack || message;
			lines.push(`    <failure message="${escapeXml(message)}"><![CDATA[${cdata(detail)}]]></failure>`);
		}
		else if (test.status === "skipped") {
			lines.push(`    <skipped message="${escapeXml(test.reason || "skipped")}"/>`);
		}
		lines.push("  </testcase>");
	}
	lines.push("</testsuite>");
	return lines.join("\n") + "\n";
}

function jsonReport(result) {
	return JSON.stringify(result, null, 2) + "\n";
}

function report(result, reporter) {
	switch (reporter) {
		case "spec": return specReport(result);
		case "json": return jsonReport(result);
		case "junit": return junitReport(result);
		default: throw new Error(`unknown reporter: ${reporter}`);
	}
}

async function writeReport(result, options) {
	const text = report(result, options.reporter);
	if (options.stdout)
		process.stdout.write(text);
	if (options.reportFile) {
		await mkdir(dirname(resolve(options.reportFile)), { recursive: true });
		await writeFile(options.reportFile, text);
	}
}

async function executable(path) {
	try {
		await access(path, fsConstants.X_OK);
		return path;
	}
	catch {
		return null;
	}
}

async function findExecutable(name, candidates = []) {
	for (const candidate of candidates) {
		if (!candidate)
			continue;
		const path = isAbsolute(candidate) || candidate.includes(sep) ? candidate : null;
		if (path && await executable(path))
			return path;
	}
	const pathDirs = (process.env.PATH || "").split(":").filter(Boolean);
	for (const dir of pathDirs) {
		const found = await executable(join(dir, name));
		if (found)
			return found;
	}
	for (const candidate of candidates) {
		if (!candidate || candidate.includes(sep))
			continue;
		const found = await findExecutable(candidate);
		if (found)
			return found;
	}
	throw new Error(`cannot find executable: ${name}`);
}

function spawnProcess(command, args, options = {}) {
	return new Promise((resolveProcess, rejectProcess) => {
		const child = spawn(command, args, {
			cwd: options.cwd || moddableRoot,
			env: options.env || process.env,
			stdio: options.stdio || ["ignore", "pipe", "pipe"],
			shell: !!options.shell,
			detached: !!options.detached,
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", data => {
			const text = String(data);
			stdout += text;
			options.onStdout?.(text);
		});
		child.stderr?.on("data", data => {
			const text = String(data);
			stderr += text;
			options.onStderr?.(text);
		});
		child.on("error", rejectProcess);
		child.on("close", (code, signal) => {
			resolveProcess({ code, signal, stdout, stderr, child });
		});
	});
}

async function runXst(options) {
	const xst = options.xst || await findExecutable("xst", [
		join(moddableRoot, "build/bin/lin/release/xst"),
		join(moddableRoot, "build/bin/lin/debug/xst"),
	]);
	const collector = new EventCollector({ onLogText: appLogWriter(options) });
	const result = await spawnProcess(xst, ["-m", resolve(options.test)], {
		onStdout: text => collector.appendText(text),
		onStderr: text => process.stderr.write(text),
	});
	collector.flush();
	if (result.code !== 0)
		throw new Error(`xst exited with ${result.code}`);
	return requireRunDone(summarize(collector.events, "mctest/xst"), "xst");
}

async function readStream(stream, collector) {
	return new Promise((resolveRead, rejectRead) => {
		stream.setEncoding("utf8");
		stream.on("data", text => collector.appendText(text));
		stream.on("error", rejectRead);
		stream.on("end", () => {
			collector.flush();
			resolveRead();
		});
	});
}

async function runDevice(options) {
	const collector = new EventCollector({ onLogText: appLogWriter(options) });
	if (options.input) {
		if (options.input === "-")
			await readStream(process.stdin, collector);
		else
			await readStream(createReadStream(resolve(options.input)), collector);
	}
	else if (options.deviceLogCommand) {
		const result = await spawnProcess(options.deviceLogCommand, [], {
			shell: true,
			onStdout: text => collector.appendText(text),
			onStderr: text => process.stderr.write(text),
		});
		collector.flush();
		if (result.code !== 0)
			throw new Error(`device log command exited with ${result.code}`);
	}
	else {
		throw new Error("device target requires --input or --device-log-command");
	}
	return requireRunDone(summarize(collector.events, "mctest/device"), "device");
}

function startXsbugServer(port, collector, options = {}) {
	let buffer = "";
	const server = createServer(socket => {
		if (options.debugXsbug)
			process.stderr.write("# mctest xsbug connected\n");
		socket.setEncoding("utf8");
		socket.on("data", chunk => {
			if (options.debugXsbug)
				process.stderr.write(`# mctest xsbug chunk ${JSON.stringify(chunk)}\n`);
			if (chunk.includes("<login") || chunk.includes("<break") || chunk.includes("<bubble"))
				socket.write("\r\n<go/>\r\n");
			buffer += chunk;
			let match;
			const regexp = /<log(?:\s[^>]*)?>([\s\S]*?)<\/log>/g;
			let lastIndex = 0;
			while ((match = regexp.exec(buffer))) {
				collector.appendText(xmlDecode(match[1]));
				lastIndex = regexp.lastIndex;
			}
			if (lastIndex)
				buffer = buffer.slice(lastIndex);
			else if (buffer.length > 8192)
				buffer = buffer.slice(-8192);
		});
	});
	return new Promise((resolveServer, rejectServer) => {
		server.on("error", rejectServer);
		server.listen(port, "127.0.0.1", () => resolveServer(server));
	});
}

async function freePort() {
	const server = createServer();
	await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
	const { port } = server.address();
	await new Promise(resolveClose => server.close(resolveClose));
	return port;
}

async function waitForFile(path, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const stat = statSync(path);
			if (stat.size > 0)
				return;
		}
		catch {
		}
		await new Promise(resolveWait => setTimeout(resolveWait, 50));
	}
	throw new Error(`timed out waiting for file: ${path}`);
}

async function builtMcSoPath(options) {
	const manifest = resolve(options.manifest);
	const text = await readFile(manifest, "utf8").catch(() => null);
	let name = dirname(manifest).split(sep).pop();
	if (text) {
		try {
			name = JSON.parse(text).build?.NAME || name;
		}
		catch {
		}
	}
	const [host, device] = options.platform.split("/");
	return join(moddableRoot, "build/bin", host, device || "", "debug", name, "mc.so");
}

function killChildGroup(child) {
	if (!child || child.killed)
		return;
	try {
		if (process.platform !== "win32" && child.pid)
			process.kill(-child.pid, "SIGTERM");
		else
			child.kill("SIGTERM");
	}
	catch {
		try { child.kill("SIGTERM"); } catch {}
	}
}

async function runMcsim(options) {
	const mcconfig = options.mcconfig || await findExecutable("mcconfig", [
		join(moddableRoot, "build/bin/lin/release/mcconfig"),
		join(moddableRoot, "build/bin/lin/debug/mcconfig"),
	]);
	const mcsim = options.mcsim || await findExecutable("mcsim", [
		join(moddableRoot, "build/bin/lin/debug/mcsim"),
		join(moddableRoot, "build/bin/lin/release/mcsim"),
	]);
	const collector = new EventCollector({ onLogText: appLogWriter(options) });
	const port = await freePort();
	const server = await startXsbugServer(port, collector, options);
	const tmp = await mkdtemp(join(tmpdir(), "mctest-mcsim-"));
	const home = join(tmp, "home");
	const config = join(tmp, "config");
	await mkdir(home, { recursive: true });
	await mkdir(config, { recursive: true });

	let child;
	try {
		const toolPath = [
			join(moddableRoot, "build/bin/lin/release"),
			join(moddableRoot, "build/bin/lin/debug"),
			process.env.PATH || "",
		].filter(Boolean).join(":");
		let mcSo = options.mcSo ? resolve(options.mcSo) : null;
		if (!mcSo) {
			const build = await spawnProcess(mcconfig, ["-d", "-x", `127.0.0.1:${port}`, "-m", "-p", options.platform, "-t", "build", resolve(options.manifest)], {
				env: { ...process.env, MODDABLE: process.env.MODDABLE || moddableRoot, PATH: toolPath },
				onStdout: text => process.stderr.write(text),
				onStderr: text => process.stderr.write(text),
			});
			if (build.code !== 0)
				throw new Error(`mcconfig exited with ${build.code}`);
			mcSo = await builtMcSoPath(options);
		}

		let command = mcsim;
		let args = ["--app", mcSo];
		if (options.mcsimMode !== "full")
			args.push("--mode", options.mcsimMode);
		if (options.screenshot)
			args.push("--screenshot", resolve(options.screenshot));
		if (options.useXvfb) {
			const xvfb = await findExecutable("xvfb-run", ["xvfb-run"]).catch(() => null);
			if (xvfb) {
				command = xvfb;
				args = ["-a", mcsim, ...args];
			}
		}
		if (options.useDbusRunSession) {
			const dbus = await findExecutable("dbus-run-session", ["dbus-run-session"]).catch(() => null);
			if (dbus) {
				args = ["--", command, ...args];
				command = dbus;
			}
		}

		const env = {
			...process.env,
			MODDABLE: process.env.MODDABLE || moddableRoot,
			PATH: toolPath,
			HOME: home,
			XDG_CONFIG_HOME: config,
			GIO_USE_VFS: "local",
			GSETTINGS_BACKEND: "memory",
			GTK_USE_PORTAL: "0",
			NO_AT_BRIDGE: "1",
			XSBUG_HOST: "127.0.0.1",
			XSBUG_PORT: String(port),
		};

		child = spawn(command, args, {
			cwd: moddableRoot,
			env,
			stdio: ["ignore", "ignore", "pipe"],
			detached: process.platform !== "win32",
		});
		child.stderr.on("data", data => process.stderr.write(data));
		const done = await collector.waitForDone(options.timeoutMs);
		if (options.screenshot)
			await waitForFile(resolve(options.screenshot), 2_000);
		collector.add({ protocol: PROTOCOL, type: "runner:mcsim:done", name: done.name });
		killChildGroup(child);
		return requireRunDone(summarize(collector.events, "mctest/mcsim"), "mcsim");
	}
	finally {
		killChildGroup(child);
		server.close();
		await rm(tmp, { recursive: true, force: true });
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		process.stdout.write(usage());
		return;
	}
	if (options.command !== "run")
		throw new Error(`unknown command: ${options.command}`);

	let result;
	if (options.target === "xst")
		result = await runXst(options);
	else if (options.target === "mcsim")
		result = await runMcsim(options);
	else if (options.target === "device")
		result = await runDevice(options);
	else
		throw new Error(`unknown target: ${options.target}`);

	await writeReport(result, options);
	if (result.failed > 0)
		process.exitCode = 1;
}

main().catch(error => {
	console.error(error.stack || error.message || String(error));
	process.exitCode = 1;
});
