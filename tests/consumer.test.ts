import {
	access,
	cp,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { command, withCommands } from "./support/command.ts";
import { observeCompiler } from "./support/compiler.ts";
import { allocate } from "./support/database.ts";
import { type Candidate, workspace } from "./support/packages.ts";
import { materialize } from "./support/project.ts";
import type { ApplicationException, Observation } from "./support/types.ts";

// Generated discovery files only select a scenario. Assertions remain Vitest's.
export function consumer(name: string) {
	test(name, async ({ signal }) =>
		withCommands(signal, async () => {
			const candidates: Candidate[] = JSON.parse(
				await readFile(join(workspace, ".vitest", "candidates.json"), "utf8"),
			);
			let directory: string | undefined;
			let database: Awaited<ReturnType<typeof allocate>> | undefined;
			let stage = "install";
			const observed: Observation = {};
			try {
				directory = await mkdtemp(join(tmpdir(), `typesql-${name}-`));
				const project = await materialize(name, candidates, directory);
				directory = project.directory;
				const { manifest } = project;
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
					NODE_OPTIONS: `--import=${join(directory, ".consumer", "runtime.mjs")}`,
				};
				const normalize = (text: string) => {
					let value = text.replaceAll(directory!, "<consumer>");
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
