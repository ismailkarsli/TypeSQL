import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { required } from "./command.ts";
import { ready } from "./database.ts";
import {
	packageNames,
	preparePackages,
	repository,
	workspace,
} from "./packages.ts";

export default async function setup() {
	try {
		return await environment();
	} catch (cause) {
		const retained = join(
			process.env.CONSUMER_ARTIFACTS ?? join(workspace, ".artifacts"),
			"setup",
		);
		await mkdir(retained, { recursive: true });
		await writeFile(
			join(retained, "failure.json"),
			JSON.stringify(
				{
					stage: "environment/build/pack",
					node: process.version,
					platform: process.platform,
					architecture: process.arch,
					error: String(cause),
				},
				null,
				2,
			),
		);
		for (const [name, cwd] of [
			["root", repository],
			["tests", workspace],
			...packageNames.map((name) => [name, join(repository, "packages", name)]),
		]) {
			try {
				await cp(join(cwd!, ".consumer"), join(retained, name!), {
					recursive: true,
				});
			} catch (error) {
				if (
					!(
						error instanceof Error &&
						"code" in error &&
						error.code === "ENOENT"
					)
				)
					throw error;
			}
		}
		throw new Error(
			`Infrastructure: consumer prerequisites failed; logs retained at ${retained}`,
			{ cause },
		);
	}
}

async function environment() {
	if (
		process.version !== "v26.8.1" ||
		process.platform !== "linux" ||
		process.arch !== "x64"
	)
		throw new Error(
			"Infrastructure: use the pinned linux/amd64 Docker environment",
		);
	for (const [binary, version] of [
		["pnpm", "12.11.2"],
		["bun", "1.4.3"],
	]) {
		const result = await required(workspace, [binary!, "--version"]);
		if (result.stdout.trim() !== version)
			throw new Error(`Infrastructure: expected ${binary} ${version}`);
	}
	await ready();
	const run = await preparePackages();
	await writeFile(
		join(workspace, ".vitest", "candidates.json"),
		JSON.stringify(run.candidates),
	);
	return async () => {
		await rm(run.directory, { recursive: true, force: true });
	};
}
