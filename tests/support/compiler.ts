import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { required } from "./command.ts";
import type { CompilerObservation } from "./types.ts";
export async function observeCompiler(directory: string) {
	await required(directory, ["node", join(import.meta.dirname, "observe.ts")]);
	const observation: CompilerObservation = JSON.parse(
		await readFile(join(directory, ".scenario", "compiler.json"), "utf8"),
	);
	return observation;
}
