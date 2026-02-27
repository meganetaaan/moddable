#!/usr/bin/env node
/*
 * Copyright (c) 2026  Moddable Tech, Inc.
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

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { exec } = require("node:child_process");

const moddableRoot = path.resolve(__dirname, "..", "..");
let Machine;
try {
	({ Machine } = require(path.join(moddableRoot, "tools/xsbug-log/xsbug-machine.js")));
}
catch (error) {
	if (error.code === "MODULE_NOT_FOUND") {
		console.error("mctest: missing xsbug-log dependencies. Run:");
		console.error("  cd $MODDABLE/tools/xsbug-log");
		console.error("  npm install");
		process.exit(1);
	}
	throw error;
}

function debugLog(message) {
	if (process.env.MCTEST_DEBUG)
		console.error(`#mctest ${message}`);
}

function usage() {
	console.log("Usage:");
	console.log("  mctest.js list [--app testmc|test262] [--root <dir>] [--select <glob,...>] [--format text|json]");
	console.log("  mctest.js run [--app testmc|test262] [--root <dir>] [--select <glob,...>] [--launch <command>] [--launch-cwd <dir>] [--host 127.0.0.1] [--port 5002] [--connect-timeout 30000] [--timeout 30000] [--format text|json|junit] [--out <path>]");
	console.log("  mctest.js rerun --failed <json-report> [--launch <command>] [--launch-cwd <dir>] [--host 127.0.0.1] [--port 5002] [--connect-timeout 30000] [--timeout 30000] [--format text|json|junit] [--out <path>]");
}

function parseArgs(argv) {
	const args = { _: [] };
	let i = 0;
	while (i < argv.length) {
		const value = argv[i];
		if (value.startsWith("--")) {
			const key = value.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			const next = argv[i + 1];
			if (!next || next.startsWith("--"))
				args[key] = true;
			else {
				args[key] = next;
				i++;
			}
		}
		else
			args._.push(value);
		i++;
	}
	return args;
}

function splitCsv(value) {
	if (!value)
		return [];
	return value.split(",").map(item => item.trim()).filter(Boolean);
}

function collectTests(root) {
	const tests = [];
	function walk(current) {
		const entries = fs.readdirSync(current, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory())
				walk(fullPath);
			else if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.endsWith("_FIXTURE.js"))
				tests.push(fullPath);
		}
	}
	walk(root);
	tests.sort();
	return tests;
}

function globToRegExp(pattern) {
	const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
	const withDoubleStar = escaped.replace(/\\\*\\\*/g, ".*");
	const withSingleStar = withDoubleStar.replace(/\\\*/g, "[^/]*");
	return new RegExp(`^${withSingleStar}$`);
}

function selectTests(root, tests, selectPatterns) {
	if (!selectPatterns.length)
		return tests;
	const regexes = selectPatterns.map(globToRegExp);
	return tests.filter(test => {
		const relative = path.relative(root, test).split(path.sep).join("/");
		return regexes.some(regex => regex.test(relative));
	});
}

function parseFrontmatter(pathname) {
	const source = fs.readFileSync(pathname, "utf8");
	const start = source.indexOf("/*---");
	if (start < 0)
		return {};
	const end = source.indexOf("---*/", start + 5);
	if (end < 0)
		return {};

	const block = source.slice(start + 5, end);
	const lines = block.split(/\r?\n/);
	const metadata = {
		flags: [],
		includes: []
	};

	let mode = null;
	for (const raw of lines) {
		const line = raw.replace(/\t/g, "    ");
		const trimmed = line.trim();
		if (!trimmed)
			continue;

		if (!line.startsWith(" ") && !line.startsWith("-"))
			mode = null;

		if (trimmed.startsWith("flags:")) {
			mode = "flags";
			const match = trimmed.match(/flags:\s*\[(.*)\]/);
			if (match)
				metadata.flags = splitCsv(match[1]);
			continue;
		}
		if (trimmed.startsWith("includes:")) {
			mode = "includes";
			const match = trimmed.match(/includes:\s*\[(.*)\]/);
			if (match)
				metadata.includes = splitCsv(match[1]);
			continue;
		}
		if (trimmed.startsWith("negative:")) {
			mode = "negative";
			continue;
		}

		if (mode === "includes") {
			const match = trimmed.match(/^-\s*(.*)$/);
			if (match && match[1])
				metadata.includes.push(match[1].trim());
			continue;
		}
		if (mode === "negative") {
			const match = trimmed.match(/^type:\s*(.*)$/);
			if (match)
				metadata.negative = match[1].trim();
			continue;
		}
	}

	metadata.module = metadata.flags.includes("module");
	metadata.async = metadata.flags.includes("async");
	return metadata;
}

function resolveIncludePath(testRoot, includeName, extraRoots = []) {
	const candidates = [];
	for (const root of extraRoots) {
		if (!root)
			continue;
		candidates.push(path.join(root, includeName));
	}
	candidates.push(path.join(path.dirname(testRoot), "harness", includeName));
	candidates.push(path.join(moddableRoot, "tools/test262", includeName));
	for (const candidate of candidates) {
		if (fs.existsSync(candidate))
			return candidate;
	}
	return null;
}

function launchCommand(command, cwd) {
	return exec(`exec ${command}`, { cwd });
}

let gTestmcModuleMap;

function resolveExistingModulePath(pathname) {
	if (!pathname)
		return null;
	if (fs.existsSync(pathname))
		return pathname;
	const withJS = `${pathname}.js`;
	if (fs.existsSync(withJS))
		return withJS;
	return null;
}

function loadTestmcModuleMap() {
	if (gTestmcModuleMap !== undefined)
		return gTestmcModuleMap;

	const candidates = [
		path.join(moddableRoot, "build", "tmp", "lin", "mc", "debug", "testmc", "manifest_flat.json"),
		path.join(moddableRoot, "build", "tmp", "lin", "mc", "release", "testmc", "manifest_flat.json"),
	];

	const map = new Map();
	for (const candidate of candidates) {
		if (!fs.existsSync(candidate))
			continue;
		const manifest = JSON.parse(fs.readFileSync(candidate, "utf8"));
		const modules = manifest.modules ?? {};
		for (const [id, values] of Object.entries(modules)) {
			if ((id === "*") || (id === "~"))
				continue;
			if (!Array.isArray(values) || !values.length)
				continue;
			const resolved = resolveExistingModulePath(values[0]);
			if (resolved)
				map.set(id, resolved);
		}
		break;
	}

	gTestmcModuleMap = map;
	return gTestmcModuleMap;
}

function resolveTestmcModulePath(pathname) {
	const map = loadTestmcModuleMap();
	const mapped = map.get(pathname);
	if (!mapped)
		return null;
	return resolveExistingModulePath(mapped);
}

async function waitForReady(machine, timeout, context = "ready") {
	for (;;) {
		const message = await machine.waitMessage(timeout);
		debugLog(`${context} message=${message}`);
		if (message === ">")
			return;
		if (message !== "<")
			throw new Error(`${context} failed: ${message}`);
	}
}

function escapeXML(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\"", "&quot;")
		.replaceAll("'", "&apos;");
}

function writeReport(report, format, outPath) {
	let text;
	if (format === "json") {
		text = JSON.stringify(report, null, 2) + "\n";
	}
	else if (format === "junit") {
		const cases = report.results.map(result => {
			const testcase = `  <testcase classname="mctest" name="${escapeXML(result.path)}" time="${(result.duration_ms / 1000).toFixed(3)}">`;
			if (result.status === "failed")
				return `${testcase}\n    <failure message="${escapeXML(result.message || "failed")}"/>\n  </testcase>`;
			if (result.status === "skipped")
				return `${testcase}\n    <skipped/>\n  </testcase>`;
			return `${testcase}</testcase>`;
		});
		text = [
			`<testsuite name="mctest" tests="${report.summary.total}" failures="${report.summary.failed}" skipped="${report.summary.skipped}">`,
			...cases,
			"</testsuite>",
			""
		].join("\n");
	}
	else {
		const lines = [];
		lines.push(`total=${report.summary.total} passed=${report.summary.passed} failed=${report.summary.failed} skipped=${report.summary.skipped}`);
		for (const result of report.results)
			lines.push(`${result.status.toUpperCase()} ${result.path}${result.message ? ` :: ${result.message}` : ""}`);
		text = lines.join("\n") + "\n";
	}

	if (outPath) {
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, text);
	}
	else {
		process.stdout.write(text);
	}
}

class HeadlessMachine extends Machine {
	constructor(input, output) {
		super(input, output);
		this.messages = [];
		this.waiters = [];
		this.connected = false;
		this.disconnected = false;
		this.disconnectReason = "";
		this.title = "";
		this.onConnected = null;
		this.waitForConnectResolve = null;
		this.waitForConnect = new Promise(resolve => {
			this.waitForConnectResolve = resolve;
		});
	}
	onTitleChanged(title, tag) {
		super.onTitleChanged(title, tag);
		this.title = title ?? "";
		if (this.title)
			debugLog(`connected title=${this.title}`);
		this.connected = true;
		if (this.waitForConnectResolve) {
			this.waitForConnectResolve();
			this.waitForConnectResolve = null;
		}
		if (this.onConnected)
			this.onConnected(this);
	}
	onBroken(pathname, line, text) {
		const message = text ? String(text) : "exception";
		debugLog(`broken path=${pathname} line=${line} text=${message}`);
		super.onBroken(pathname, line, text);
	}
	onError(error) {
		debugLog(`parser error=${error?.message ?? error}`);
		super.onError(error);
	}
	onDisconnected(reason = "disconnected") {
		if (this.disconnected)
			return;
		this.disconnected = true;
		this.disconnectReason = reason;
		const error = new Error(reason);
		const waiters = this.waiters.splice(0);
		for (const waiter of waiters)
			waiter.reject(error);
	}
	onImport(pathname) {
		let resolved = resolveExistingModulePath(pathname);
		if (!resolved)
			resolved = resolveTestmcModulePath(pathname);
		debugLog(`import request path=${pathname} resolved=${resolved ? resolved : "(none)"}`);
		if (resolved)
			this.doModule(resolved, false, fs.readFileSync(resolved, "utf8"));
		else
			this.doGo();
	}
	onBubbled(id, flags, path, line, message) {
		debugLog(`bubble id=${id} flags=${flags} path=${path} line=${line} message=${message}`);
		if (id !== "test262")
			return;
		const waiter = this.waiters.shift();
		if (waiter) {
			waiter.resolve(message);
			return;
		}
		this.messages.push(message);
	}
	onLogged(path, line, text) {
		if (!process.env.MCTEST_DEBUG_LOGS)
			return;
		debugLog(`log path=${path} line=${line} text=${text}`);
	}
	waitMessage(timeout) {
		if (this.messages.length)
			return Promise.resolve(this.messages.shift());
		if (this.disconnected)
			return Promise.reject(new Error(this.disconnectReason || "disconnected"));
		return new Promise((resolve, reject) => {
			const waiter = {
				resolve: value => {
					clearTimeout(timer);
					resolve(value);
				},
				reject: error => {
					clearTimeout(timer);
					reject(error);
				},
			};
			const timer = setTimeout(() => {
				const index = this.waiters.indexOf(waiter);
				if (index >= 0)
					this.waiters.splice(index, 1);
				reject(new Error(`timeout (${timeout} ms)`));
			}, timeout);
			this.waiters.push(waiter);
		});
	}
}

async function runTests(options) {
	const host = options.host ?? "127.0.0.1";
	const port = Number(options.port ?? 5002);
	const timeout = Number(options.timeout ?? 30000);
	const connectTimeout = Number(options.connectTimeout ?? 30000);
	const format = options.format ?? "text";

	const app = options.app ?? "testmc";
	let root = options.root;
	if (!root) {
		if (app === "testmc")
			root = path.join(moddableRoot, "tests", "modules");
		else
			throw new Error("--root is required for app=test262");
	}
	root = path.resolve(root);

	const selectPatterns = splitCsv(options.select);
	const allTests = collectTests(root);
	const selected = options.files ?? selectTests(root, allTests, selectPatterns);
	if (!selected.length)
		throw new Error("no tests selected");
	debugLog(`selected tests=${selected.length}`);
	if ((app === "testmc") && (selected.length > 1)) {
		const hasNonModule = selected.some(pathname => !parseFrontmatter(pathname).module);
		if (hasNonModule) {
			console.error("mctest: warning: multiple non-module tests may leak global bindings. Run individually or use module tests for reliable results.");
		}
	}

	const server = net.createServer();
	const sockets = new Set();
	const machinePromise = new Promise(resolve => {
		let settled = false;
		const maybeResolve = candidate => {
			if (settled)
				return;
			if ((app === "testmc") && (candidate.title !== "testmc")) {
				debugLog(`waiting for title=testmc (got ${candidate.title || "(empty)"})`);
				return;
			}
			settled = true;
			resolve(candidate);
		};

		server.on("connection", socket => {
			sockets.add(socket);
			socket.on("close", () => {
				sockets.delete(socket);
				if (machine)
					machine.onDisconnected("socket closed");
			});
			socket.on("error", error => {
				if (machine)
					machine.onDisconnected(`socket error: ${error?.message ?? error}`);
			});
			socket.setEncoding("utf8");
			const machine = new HeadlessMachine(socket, socket);
			machine.onConnected = maybeResolve;
		});
	});
	await new Promise((resolve, reject) => {
		const onError = error => {
			server.off("listening", onListening);
			reject(error);
		};
		const onListening = () => {
			server.off("error", onError);
			resolve();
		};
		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(port, host);
	});

	let launched = null;
	if (options.launch) {
		let launchCwd = moddableRoot;
		if (options.launchCwd)
			launchCwd = path.resolve(options.launchCwd);
		else if (app === "testmc")
			launchCwd = path.join(moddableRoot, "tools", "testmc");
		debugLog(`launch cwd=${launchCwd}`);
		debugLog(`launch cmd=${options.launch}`);
		launched = launchCommand(options.launch, launchCwd);
		if (launched && process.env.MCTEST_DEBUG) {
			launched.stdout?.on("data", data => process.stderr.write(`#mctest launch stdout: ${data}`));
			launched.stderr?.on("data", data => process.stderr.write(`#mctest launch stderr: ${data}`));
		}
	}

	let machine;
	try {
		machine = await Promise.race([
			machinePromise,
			new Promise((_, reject) => setTimeout(() => reject(new Error(`connect timeout (${connectTimeout} ms)`)), connectTimeout))
		]);
		debugLog("machine ready");
		if (app === "testmc")
			await waitForReady(machine, connectTimeout, "startup");

		const report = {
			created_at: new Date().toISOString(),
			app,
			root,
			select: selectPatterns,
			results: [],
			failedPaths: []
		};

		for (const pathname of selected) {
			const startedAt = Date.now();
			debugLog(`start test=${pathname}`);
			const metadata = parseFrontmatter(pathname);
			const includes = [];
			for (const includeName of metadata.includes ?? []) {
				const resolved = resolveIncludePath(root, includeName, splitCsv(options.harnessRoots));
				if (resolved)
					includes.push(resolved);
			}

			const queue = [...includes, pathname];
			let status = "passed";
			let message = "";

			try {
				while (queue.length) {
					const scriptPath = queue.shift();
					const isLast = queue.length === 0;
					if (isLast && metadata.module) {
						debugLog(`import path=${scriptPath} async=${metadata.async ? 1 : 0}`);
						machine.doImport(scriptPath, metadata.async);
					}
					else {
						debugLog(`script path=${scriptPath} async=${(isLast ? metadata.async : false) ? 1 : 0}`);
						machine.doScript(scriptPath, isLast ? metadata.async : false, fs.readFileSync(scriptPath, "utf8"));
					}

					debugLog(`wait timeout=${timeout}`);
					let bubble;
					for (;;) {
						bubble = await machine.waitMessage(timeout);
						debugLog(`recv message=${bubble}`);
						// testmc readiness marker can arrive at any point; ignore it for per-script result handling.
						if (bubble !== ">")
							break;
					}
					if (bubble === "<")
						continue;

					if (metadata.negative && isLast && bubble.startsWith(metadata.negative)) {
						status = "passed";
						message = "";
					}
					else {
						status = "failed";
						message = bubble;
					}
					break;
				}

				if ((status === "passed") && metadata.negative) {
					status = "failed";
					message = `Expected ${metadata.negative} but got no errors`;
				}
			}
			catch (error) {
				status = "failed";
				message = error.message;
			}
			debugLog(`result status=${status}${message ? ` message=${message}` : ""}`);

			const result = {
				path: path.relative(root, pathname).split(path.sep).join("/"),
				status,
				message,
				duration_ms: Date.now() - startedAt
			};
			report.results.push(result);
			if (status === "failed")
				report.failedPaths.push(pathname);
		}

		const summary = { total: report.results.length, passed: 0, failed: 0, skipped: 0 };
		for (const result of report.results)
			summary[result.status] += 1;
		report.summary = summary;

		writeReport(report, format, options.out && path.resolve(options.out));
		return summary.failed ? 1 : 0;
	}
	finally {
		for (const socket of sockets)
			socket.destroy();
		if (launched) {
			launched.kill();
			launched.stdout?.destroy();
			launched.stderr?.destroy();
		}
		server.close();
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const command = args._[0];
	if (!command || command === "help" || command === "--help" || command === "-h") {
		usage();
		return;
	}

	if (command === "list") {
		const app = args.app ?? "testmc";
		let root = args.root;
		if (!root) {
			if (app === "testmc")
				root = path.join(moddableRoot, "tests", "modules");
			else
				throw new Error("--root is required for app=test262");
		}
		root = path.resolve(root);
		const tests = selectTests(root, collectTests(root), splitCsv(args.select))
			.map(pathname => path.relative(root, pathname).split(path.sep).join("/"));
		if ((args.format ?? "text") === "json")
			process.stdout.write(JSON.stringify({ app, root, tests }, null, 2) + "\n");
		else
			process.stdout.write(tests.join("\n") + "\n");
		return;
	}

	if (command === "rerun") {
		if (!args.failed)
			throw new Error("--failed is required");
		const previous = JSON.parse(fs.readFileSync(path.resolve(args.failed), "utf8"));
		if (!Array.isArray(previous.failedPaths) || !previous.failedPaths.length)
			throw new Error("no failed paths in report");

		const code = await runTests({
			...args,
			app: previous.app ?? args.app,
			root: previous.root ?? args.root,
			files: previous.failedPaths
		});
		process.exit(code);
	}

	if (command === "run") {
		const code = await runTests(args);
		process.exit(code);
	}

	throw new Error(`unknown command: ${command}`);
}

main().catch(error => {
	console.error(`mctest: ${error.message}`);
	process.exit(1);
});
