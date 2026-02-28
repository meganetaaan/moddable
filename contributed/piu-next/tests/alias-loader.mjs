import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(here, "..", "dist");

const aliases = new Map([
	["signal", "signal.js"],
	["ir", "ir.js"],
	["ref", "ref.js"],
	["animation", "animation.js"],
	["resource", "resource.js"],
	["drivers", "drivers.js"],
	["piu-runtime", "piu-runtime.js"],
]);

export async function resolve(specifier, context, nextResolve) {
	const mapped = aliases.get(specifier);
	if (mapped) {
		const url = pathToFileURL(path.join(distRoot, mapped)).href;
		return nextResolve(url, context);
	}
	return nextResolve(specifier, context);
}
