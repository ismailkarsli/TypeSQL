import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { required } from "./command.ts";

export const workspace = resolve(import.meta.dirname, "..");
export const repository = resolve(workspace, "..");
export const packageNames = [
	"core",
	"pg",
	"postgres",
	"sqlite",
	"kysely",
	"drizzle",
	"prisma",
	"cli",
];
export const digest = (data: string | Buffer) =>
	createHash("sha512").update(data).digest("hex");
export interface Candidate {
	name: string;
	file: string;
	hash: string;
	manifest: {
		name: string;
		version: string;
		dependencies?: Record<string, string>;
	};
}
export async function preparePackages() {
	const directory = await mkdtemp(join(tmpdir(), "typesql-packages-"));
	await required(
		repository,
		[
			"pnpm",
			...packageNames.flatMap((n) => ["--filter", `@typesql/${n}`]),
			"run",
			"build",
		],
		{},
		300_000,
	);
	const candidates: Candidate[] = [];
	for (const name of packageNames) {
		const cwd = join(repository, "packages", name);
		await required(cwd, ["pnpm", "pack", "--pack-destination", directory]);
		const manifest = JSON.parse(
			await readFile(join(cwd, "package.json"), "utf8"),
		);
		const files = (await readdir(directory)).filter(
			(file) => file.startsWith(`typesql-${name}-`) && file.endsWith(".tgz"),
		);
		if (files.length !== 1)
			throw new Error(`Expected one tarball for ${manifest.name}: ${files}`);
		const file = join(directory, files[0]!);
		candidates.push({
			name: manifest.name,
			file,
			hash: digest(await readFile(file)),
			manifest,
		});
	}
	await writeFile(
		join(directory, "candidates.json"),
		JSON.stringify(candidates, null, 2),
	);
	return { directory, candidates };
}
