import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { required } from "./command.ts";
import { artifacts, repository } from "./paths.ts";

export default async function setup() {
	await rm(artifacts, { recursive: true, force: true });
	try {
		await environment();
	} catch (cause) {
		const retained = join(artifacts, "setup");
		await mkdir(retained, { recursive: true });
		await writeFile(
			join(retained, "failure.json"),
			JSON.stringify(
				{
					stage: "environment/build",
					node: process.version,
					platform: process.platform,
					architecture: process.arch,
					error: String(cause),
				},
				null,
				2,
			),
		);
		throw new Error(
			`Infrastructure: scenario prerequisites failed; logs retained at ${retained}`,
			{ cause },
		);
	}
}

async function environment() {
	const node = (
		await readFile(join(repository, ".node-version"), "utf8")
	).trim();
	if (
		process.version !== `v${node}` ||
		process.platform !== "linux" ||
		process.arch !== "x64"
	)
		throw new Error(`Infrastructure: expected Node ${node} on linux/x64`);
	// Builds the TypeSQL packages the scenarios depend on.
	await required(
		repository,
		["pnpm", "--filter", "{./tests/scenarios/*}^...", "run", "build"],
		{ timeout: 300_000 },
	);
}
