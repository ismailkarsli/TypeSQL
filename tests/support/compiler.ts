import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { required } from "./command.ts";
import type { CompilerObservation } from "./types.ts";
export async function observeCompiler(directory: string) {
	await required(directory, ["node", ".consumer/observe.mjs"]);
	const observation: CompilerObservation = JSON.parse(
		await readFile(join(directory, ".consumer", "compiler.json"), "utf8"),
	);
	return observation;
}
