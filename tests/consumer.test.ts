import {
	access,
	cp,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { command, withCommands } from "./support/command.ts";
import { observeCompiler } from "./support/compiler.ts";
import { allocate } from "./support/database.ts";
import type {
	ApplicationException,
	Observation,
	Scenario,
} from "./support/types.ts";

const workspace = import.meta.dirname;
const repository = resolve(workspace, "..");

// Generated discovery files only select a scenario. Assertions remain Vitest's.
export function consumer(name: string) {
	test(name, async ({ signal }) =>
		withCommands(signal, async () => {
			let directory: string | undefined;
			let database: Awaited<ReturnType<typeof allocate>> | undefined;
			let stage = "prepare";
			const observed: Observation = {};
			try {
				directory = await mkdtemp(join(tmpdir(), `typesql-${name}-`));
				const manifest = await prepare(name, directory);
				if (
					manifest.consumer?.failure &&
					(!manifest.scripts[manifest.consumer.failure.stage] ||
						manifest.consumer.failure.exitCode <= 0)
				)
					throw new Error("Invalid expected failure contract");
				database = await allocate(manifest.consumer?.database, directory);
				const env = {
					...database.env,
					CONSUMER_ERROR_FILE: join(directory, ".consumer", "exception.json"),
					NODE_OPTIONS: `--import=${join(workspace, "support", "runtime.ts")}`,
				};
				const normalize = (text: string) => {
					let value = text
						.replaceAll(directory!, "<consumer>")
						.replaceAll(repository, "<workspace>");
					if (database?.env.DATABASE_URL)
						value = value.replaceAll(
							database.env.DATABASE_URL,
							"<database-url>",
						);
					return value.replace(/\(node:\d+\)/g, "(node:<pid>)");
				};
				const script = async (
					step: "setup" | "generate" | "compile" | "start",
				) => {
					stage = step;
					const result = await command(
						directory!,
						["pnpm", "--silent", "run", step],
						env,
					);
					observed[step] = {
						status: result.status,
						stdout: normalize(result.stdout),
						stderr: normalize(result.stderr),
					};
					const failure = manifest.consumer?.failure;
					if (
						result.status !== 0 &&
						(failure?.stage !== step || result.status !== failure.exitCode)
					)
						throw new Error(
							`Unexpected ${step} failure (${result.status})\n${normalize(result.stdout + result.stderr)}`,
						);
					if (failure?.stage === step && result.status === 0)
						throw new Error(
							`Expected ${step} to fail with ${failure.exitCode}, but it succeeded`,
						);
					return result;
				};
				for (const step of ["setup", "generate"] as const) {
					if (manifest.scripts[step]) {
						const result = await script(step);
						if (result.status !== 0) {
							expect(
								JSON.parse(normalize(JSON.stringify(observed))),
							).toMatchSnapshot("consumer");
							return;
						}
					}
				}
				if (manifest.scripts.generate) {
					stage = "generated artifacts";
					for (const file of manifest.consumer?.artifacts ?? []) {
						const path = resolve(directory, file);
						if (!path.startsWith(`${directory}/`))
							throw new Error(`Artifact escapes consumer: ${file}`);
						await access(path);
					}
				}
				if (!manifest.scripts.compile)
					throw new Error("Scenario requires a compile script");
				const compilation = await script("compile");
				stage = "types and diagnostics";
				const compiler = await observeCompiler(directory);
				observed.compiler = compiler;
				if ((compilation.status === 0) !== (compiler.diagnostics.length === 0))
					throw new Error(
						"Compiler command and observer disagree about diagnostics",
					);
				if (compilation.status === 0 && manifest.scripts.start) {
					await rm(env.CONSUMER_ERROR_FILE, { force: true });
					const runtime = await script("start");
					if (runtime.status !== 0) {
						let exception: ApplicationException;
						try {
							exception = JSON.parse(
								await readFile(env.CONSUMER_ERROR_FILE, "utf8"),
							);
						} catch {
							throw new Error(
								"Infrastructure: expected application exception was not observed",
							);
						}
						observed.exception = exception;
					}
				}
				stage = "artifacts";
				const artifacts: Record<string, string> = {};
				for (const file of manifest.consumer?.artifacts ?? []) {
					const path = resolve(directory, file);
					if (!path.startsWith(`${directory}/`))
						throw new Error(`Artifact escapes consumer: ${file}`);
					artifacts[file] = normalize(await readFile(path, "utf8"));
				}
				if (Object.keys(artifacts).length) observed.artifacts = artifacts;
				stage = "snapshot";
				await writeFile(
					join(directory, ".consumer", "observed.json"),
					JSON.stringify(observed, null, 2),
				);
				expect(JSON.parse(normalize(JSON.stringify(observed)))).toMatchSnapshot(
					"consumer",
				);
			} catch (cause) {
				if (directory) {
					const retained = resolve(
						process.env.CONSUMER_ARTIFACTS ?? join(workspace, ".artifacts"),
						name,
					);
					await rm(retained, { recursive: true, force: true });
					await mkdir(retained, { recursive: true });
					await mkdir(join(directory, ".consumer"), { recursive: true });
					await writeFile(
						join(directory, ".consumer", "failure.json"),
						JSON.stringify(
							{ name, stage, observed, error: String(cause) },
							null,
							2,
						),
					);
					try {
						await cp(
							join(workspace, "scenarios", name, "expected.snap"),
							join(directory, ".consumer", "expected.snap"),
						);
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
					await cp(directory, retained, { recursive: true });
					throw new Error(
						`${name}: failed at ${stage}. Consumer and logs retained at ${retained}`,
						{ cause },
					);
				}
				throw new Error(`${name}: failed at ${stage}`, { cause });
			} finally {
				await database?.cleanup();
				if (directory) await rm(directory, { recursive: true, force: true });
			}
		}),
	);
}

async function prepare(name: string, directory: string) {
	const source = join(workspace, "scenarios", name);
	await cp(source, directory, {
		recursive: true,
		filter: (path) =>
			!["node_modules", "dist", ".consumer", "expected.snap"].includes(
				basename(path),
			),
	});
	await symlink(
		join(source, "node_modules"),
		join(directory, "node_modules"),
		"dir",
	);
	await mkdir(join(directory, ".consumer"));
	const config = JSON.parse(
		await readFile(join(workspace, "tsconfig.json"), "utf8"),
	);
	delete config.compilerOptions.noEmit;
	delete config.compilerOptions.allowImportingTsExtensions;
	config.include = ["**/*.ts"];
	const configPath = join(directory, "tsconfig.json");
	try {
		const overrides = JSON.parse(await readFile(configPath, "utf8"));
		if (
			overrides.extends ||
			overrides.compilerOptions?.paths ||
			overrides.compilerOptions?.baseUrl
		)
			throw new Error(
				"Scenario compiler options must use public package imports",
			);
		Object.assign(config, {
			...overrides,
			compilerOptions: {
				...config.compilerOptions,
				...overrides.compilerOptions,
			},
		});
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw error;
	}
	await writeFile(configPath, JSON.stringify(config, null, 2));
	const manifest: Scenario = JSON.parse(
		await readFile(join(directory, "package.json"), "utf8"),
	);
	return manifest;
}
