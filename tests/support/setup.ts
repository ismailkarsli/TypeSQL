import { cp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { required } from "./command.ts";
import { ready } from "./database.ts";

const workspace = resolve(import.meta.dirname, "..");
const repository = resolve(workspace, "..");

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
		for (const [name, cwd] of [
			["root", repository],
			["tests", workspace],
		] as const) {
			try {
				await cp(join(cwd, ".consumer"), join(retained, name), {
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
		throw new Error("Infrastructure: expected Node 26.8.1 on linux/x64");
	for (const [binary, version] of [
		["pnpm", "12.16.1"],
		["bun", "1.4.3"],
	] as const) {
		const result = await required(workspace, [binary, "--version"]);
		if (result.stdout.trim() !== version)
			throw new Error(`Infrastructure: expected ${binary} ${version}`);
	}
	await ready();
	await required(
		repository,
		[
			"pnpm",
			...[
				"core",
				"pg",
				"postgres",
				"sqlite",
				"kysely",
				"drizzle",
				"prisma",
				"cli",
			].flatMap((name) => ["--filter", `@typesql/${name}`]),
			"run",
			"build",
		],
		{},
		300_000,
	);
}
