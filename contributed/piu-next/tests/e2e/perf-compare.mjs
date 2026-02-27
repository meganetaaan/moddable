import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = "5124";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "../..");
const repoRoot = path.resolve(packageDir, "../..");
const testmcDir = path.join(repoRoot, "tools", "testmc");
const outputPath = path.resolve(packageDir, "dist", "perf-report.json");

const ratioThresholds = {
	slotHeap: Number(process.env.PIUNEXT_SLOT_HEAP_MAX_RATIO ?? "3.0"),
	chunkHeap: Number(process.env.PIUNEXT_CHUNK_HEAP_MAX_RATIO ?? "1.5"),
	stack: Number(process.env.PIUNEXT_STACK_MAX_RATIO ?? "3.0"),
	piuCommandList: Number(process.env.PIUNEXT_COMMAND_LIST_MAX_RATIO ?? "3.0"),
	promisesSettled: Number(process.env.PIUNEXT_PROMISES_MAX_RATIO ?? "6.0"),
};

function run(command, args, cwd, envOverrides = undefined) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env: envOverrides ? { ...process.env, ...envOverrides } : process.env,
	});
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed with exit ${result.status}\n${output}`,
		);
	}
	return output;
}

function extractReport(output, label) {
	const marker = `METRIC-REPORT ${label} `;
	const index = output.lastIndexOf(marker);
	if (index < 0)
		throw new Error(`Unable to find metric report marker for ${label}.`);
	const start = index + marker.length;
	const end = output.indexOf("\n", start);
	const jsonText = (end >= 0) ? output.slice(start, end).trim() : output.slice(start).trim();
	return JSON.parse(jsonText);
}

function summarizeSnapshots(report) {
	const snapshots = Array.isArray(report.snapshots) ? report.snapshots : [];
	const metrics = ["slotHeap", "chunkHeap", "stack", "piuCommandList", "promisesSettled"];
	const initial = snapshots[0] ?? {};
	const peak = {};
	for (const metric of metrics) {
		let peakValue;
		for (const snapshot of snapshots) {
			const value = snapshot[metric];
			if (typeof value !== "number")
				continue;
			if ((peakValue === undefined) || (value > peakValue))
				peakValue = value;
		}
		peak[metric] = peakValue;
	}
	return { snapshots, initial, peak };
}

function calcRatios(baseline, candidate) {
	const ratios = {};
	for (const metric of Object.keys(ratioThresholds)) {
		const base = baseline[metric];
		const next = candidate[metric];
		if ((typeof base !== "number") || (typeof next !== "number") || (base === 0)) {
			ratios[metric] = undefined;
			continue;
		}
		ratios[metric] = Number((next / base).toFixed(3));
	}
	return ratios;
}

function evaluateRatios(ratios) {
	const failures = [];
	for (const metric of Object.keys(ratioThresholds)) {
		const ratio = ratios[metric];
		if (ratio === undefined)
			continue;
		if (ratio > ratioThresholds[metric]) {
			failures.push({ metric, ratio, limit: ratioThresholds[metric] });
		}
	}
	return failures;
}

function runMetricCase(select, manifest, label) {
	const output = run(
		"node",
		[
			path.join(repoRoot, "tools", "testmc", "mctest.js"),
			"run",
			"--app", "testmc",
			"--root", "tests/e2e",
			"--select", select,
			"--host", host,
			"--port", port,
			"--launch", `mcconfig -dn -m -p lin -x ${host}:${port} -t xsbug ${manifest}`,
			"--launch-cwd", "../../tools/testmc",
			"--connect-timeout", "60000",
			"--timeout", "60000",
		],
		packageDir,
		{
			MCTEST_DEBUG: "1",
			MCTEST_DEBUG_LOGS: "1",
		},
	);
	return extractReport(output, label);
}

function ensureBuild(manifest) {
	run(
		"mcconfig",
		["-dn", "-m", "-p", "lin", "-x", `${host}:${port}`, "-t", "build", manifest],
		testmcDir,
	);
}

console.log("Building baseline testmc app...");
ensureBuild("manifest.json");
console.log("Running baseline metrics...");
const baseline = summarizeSnapshots(runMetricCase("metrics-piu-baseline-e2e.js", "manifest.json", "baseline"));

console.log("Building piu-next testmc app...");
ensureBuild("manifest_piu_next.json");
console.log("Running piu-next metrics...");
const piuNext = summarizeSnapshots(runMetricCase("metrics-piu-next-e2e.js", "manifest_piu_next.json", "piu-next"));

const peakRatios = calcRatios(baseline.peak, piuNext.peak);
const failures = evaluateRatios(peakRatios);
const report = {
	generatedAt: new Date().toISOString(),
	thresholds: ratioThresholds,
	baseline,
	piuNext,
	peakRatios,
	failures,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Performance report: ${outputPath}`);
console.log(`Peak ratios: ${JSON.stringify(peakRatios)}`);
if (failures.length) {
	console.error("Performance thresholds exceeded:");
	for (const failure of failures)
		console.error(`- ${failure.metric}: ratio=${failure.ratio}, limit=${failure.limit}`);
	process.exitCode = 1;
}
