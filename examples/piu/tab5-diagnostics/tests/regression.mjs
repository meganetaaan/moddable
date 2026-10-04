/*
 * Copyright (c) 2026  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK.
 *
 *   This work is licensed under the
 *       Creative Commons Attribution 4.0 International License.
 *   To view a copy of this license, visit
 *       <http://creativecommons.org/licenses/by/4.0>.
 *   or send a letter to Creative Commons, PO Box 1866,
 *   Mountain View, CA 94042, USA.
 */

// Host-only tests: run the actual application module with hardware mocks.
// node --experimental-vm-modules --test --test-isolation=none examples/piu/tab5-diagnostics/tests/regression.mjs
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {relative} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {createContext, SourceTextModule, SyntheticModule} from "node:vm";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
function source(path) {
	const url = new URL(path, import.meta.url);
	if (process.env.TAB5_TEST_REF)
		return execFileSync("git", ["show", `${process.env.TAB5_TEST_REF}:${relative(root, fileURLToPath(url)).replaceAll("\\", "/")}`], {cwd:root, encoding:"utf8"});
	return readFileSync(url, "utf8");
}

async function load(path, globals, imports, dynamicImport) {
	const context = createContext(globals);
	const mocks = new Map();
	async function mock(specifier) {
		if (!mocks.has(specifier)) {
			assert.ok(Object.hasOwn(imports, specifier), `unexpected import: ${specifier}`);
			const exports = imports[specifier];
			const module = new SyntheticModule(Object.keys(exports), function() {
				for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
			}, {context});
			await module.link(() => {});
			await module.evaluate();
			mocks.set(specifier, module);
		}
		return mocks.get(specifier);
	}
	const module = new SourceTextModule(source(path), {
		context, identifier:path,
		importModuleDynamically: async specifier => {
			await dynamicImport(specifier);
			return mock(specifier);
		}
	});
	await module.link(mock);
	await module.evaluate();
	return module.namespace.default;
}

function deferred() {
	let resolve, reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return {promise, resolve, reject};
}

async function diagnostics() {
	const pending = [];
	const outputs = [], digitals = [], analogs = [];
	const timers = new Map();
	const Timer = {
		set(callback) { const id = {}; timers.set(id, callback); return id; },
		repeat(callback) { const id = {}; timers.set(id, callback); return id; },
		clear(id) { timers.delete(id); }
	};
	function tick() {
		const entry = timers.entries().next().value;
		assert.ok(entry, "expected a scheduled callback");
		timers.delete(entry[0]);
		entry[1]();
	}
	class Resource {
		closeCount = 0;
		close() { assert.equal(++this.closeCount, 1, "resource closed twice"); }
		configure() {}
		start() {}
	}
	class Power extends Resource {
		configuration = {speaker:false};
		configure(options) { Object.assign(this.configuration, options); }
	}
	class AudioOut extends Resource {
		constructor() { super(); outputs.push(this); }
	}
	class Digital extends Resource {
		constructor(options) { super(); this.value = options.initialValue; digitals.push(this); }
		write(value) { this.value = value; }
	}
	class Analog extends Resource {
		resolution = 12;
		constructor() { super(); analogs.push(this); }
		read() { return digitals.at(-1).value ? 4095 : 0; }
	}
	const files = {
		opened:0, disposed:0, deleted:0, failure:undefined, corrupt:false,
		openFile() {
			this.opened++;
			if (this.failure) throw this.failure;
			let bytes;
			return {
				write(data) { bytes = data.slice(); }, flush() {},
				read() { if (files.corrupt) bytes[0] ^= 1; return bytes.buffer; },
				[Symbol.dispose]() { files.disposed++; }
			};
		},
		status() { return {isFile:() => true}; },
		delete() { this.deleted++; return true; }
	};
	const model = (await load("../main.js", {
		Style:class {}, Behavior:class {},
		Application:{template:() => class {constructor(model) { this.model = model; }}},
		screen:{width:1280, height:720}, trace() {},
		device:{power:{io:Power}, rtc:{io:Resource}, sensor:{}, io:{Digital}, pin:{portBOut:52}, Analog:{default:{io:Analog}}}
	}, {
		"piu/MC":{}, "embedded:io/audio/in":{default:Resource},
		"embedded:io/audio/out":{default:AudioOut}, "embedded:io/image/in/camera":{default:Resource},
		"embedded:network/interface/wifi":{default:Resource}, "mc/config":{default:{}},
		"timer":{default:Timer}, "embedded:storage/files":{default:files}
	}, specifier => {
		assert.equal(specifier, "embedded:storage/files");
		const request = deferred(); pending.push(request); return request.promise;
	})).model;
	return {model, pending, files, timers, tick, outputs, digitals, analogs, Resource};
}

for (const destination of ["dashboard", "other page", "reopened SD"])
	for (const outcome of ["success", "import failure", "readback failure"])
		test(`SD ${outcome} after leaving for ${destination}`, async () => {
			const h = await diagnostics();
			h.model.page = 6;
			const run = h.model.sdRun();
			assert.equal(h.pending.length, 1);
			h.model.back();
			if (destination === "other page") h.model.show(15);
			if (destination === "reopened SD") {
				h.model.page = 6;
				const current = h.model.sdRun();
				h.pending[1].resolve();
				await current;
			}
			const snapshot = JSON.stringify({tests:h.model.tests, lines:h.model.lines});
			const opened = h.files.opened, deleted = h.files.deleted;
			if (outcome === "import failure") h.pending[0].reject(new Error("no SD module"));
			else {
				h.files.corrupt = outcome === "readback failure";
				h.pending[0].resolve();
			}
			await assert.doesNotReject(run);
			assert.equal(JSON.stringify({tests:h.model.tests, lines:h.model.lines}), snapshot);
			assert.equal(h.files.opened, opened, "cancelled run must not open a temporary file");
			assert.equal(h.files.deleted, deleted, "cancelled run must not delete another run's file");
			h.model.shutdown();
		});

for (const outcome of ["success", "import failure", "readback failure", "open failure"])
	test(`active SD run reports ${outcome} and releases its temporary file`, async () => {
		const h = await diagnostics();
		h.model.page = 6;
		const run = h.model.sdRun();
		if (outcome === "import failure") h.pending[0].reject(new Error("no SD module"));
		else {
			h.files.corrupt = outcome === "readback failure";
			if (outcome === "open failure") h.files.failure = new Error("card unavailable");
			h.pending[0].resolve();
		}
		await run;
		assert.equal(h.model.tests[6].status, outcome === "success" ? "PASS" : "FAIL");
		assert.equal(h.files.disposed, ["success", "readback failure"].includes(outcome) ? 1 : 0);
		assert.equal(h.files.deleted, outcome === "import failure" ? 0 : 1);
		h.model.shutdown();
	});

test("older SD run cannot overwrite a newer run on the same page", async () => {
	const h = await diagnostics();
	h.model.page = 6;
	const older = h.model.sdRun(), newer = h.model.sdRun();
	h.pending[1].resolve(); await newer;
	const snapshot = JSON.stringify(h.model.lines);
	h.pending[0].reject(new Error("stale failure")); await older;
	assert.equal(h.model.tests[6].status, "PASS");
	assert.equal(JSON.stringify(h.model.lines), snapshot);
	h.model.shutdown();
});

test("Audio Back during a tone closes it, cancels timers, and allows replay after reopening", async () => {
	const h = await diagnostics();
	h.model.show(3); h.model.audioTone(); h.model.audioTone();
	assert.equal(h.outputs.length, 1);
	const power = h.model.power;
	h.model.back();
	assert.equal(h.outputs[0].closeCount, 1);
	assert.equal(h.timers.size, 0);
	assert.equal(power.configuration.speaker, false);
	assert.equal(h.model.audioOutput, undefined);
	h.model.show(3); h.model.audioTone();
	assert.equal(h.outputs.length, 2);
	h.model.shutdown(); h.model.shutdown();
	assert.equal(h.outputs[1].closeCount, 1);
	assert.equal(power.closeCount, 1);
});

test("completed tones can replay and are closed only once", async () => {
	const h = await diagnostics();
	h.model.page = 3; h.model.audioTone(); h.tick();
	assert.equal(h.model.audioOutput, undefined);
	h.model.audioTone(); h.tick(); h.model.back();
	assert.equal(h.outputs.length, 2);
	assert.ok(h.outputs.every(output => output.closeCount === 1));
	h.model.shutdown();
});

for (const interrupt of [false, true])
	test(`Port B reruns on the same page and after reopening${interrupt ? " after interruption" : ""}`, async () => {
		const h = await diagnostics();
		h.model.show(9); h.model.portBRun(); h.model.portBRun();
		assert.equal(h.digitals.length, 1);
		if (!interrupt) {
			h.tick(); h.tick();
			assert.equal(h.model.tests[9].status, "PASS");
			h.model.portBRun();
			assert.equal(h.digitals.length, 2);
			assert.equal(h.digitals[0].closeCount, 1);
			assert.equal(h.analogs[0].closeCount, 1);
		} else h.tick();
		h.model.back();
		assert.equal(h.timers.size, 0);
		assert.ok(h.digitals.every(output => output.closeCount === 1));
		h.model.show(9); h.model.portBRun(); h.tick(); h.tick();
		assert.equal(h.model.tests[9].status, "PASS");
		assert.equal(h.digitals.length, interrupt ? 2 : 3);
		h.model.shutdown();
	});

test("repeated shutdown closes retained IMU and power once and invalidates pending SD", async () => {
	const h = await diagnostics();
	const imu = h.model.imu = new h.Resource(), power = h.model.power;
	const pageResource = h.model.own(new h.Resource());
	h.model.after(() => assert.fail("timer ran after shutdown"), 1);
	h.model.page = 6;
	const run = h.model.sdRun();
	h.model.shutdown(); h.model.shutdown();
	assert.equal(imu.closeCount, 1); assert.equal(power.closeCount, 1);
	assert.equal(pageResource.closeCount, 1);
	assert.equal(h.model.imu, undefined); assert.equal(h.model.power, undefined);
	assert.equal(h.timers.size, 0);
	const snapshot = JSON.stringify(h.model.tests);
	h.pending[0].reject(new Error("late import")); await run;
	assert.equal(JSON.stringify(h.model.tests), snapshot);
});
