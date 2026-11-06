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
import { command, required, unlessMissing, withCommands } from "./command.ts";
import { type Allocation, allocate } from "./database.ts";
import { artifacts, repository, scenarios } from "./paths.ts";
import type { CompilerObservation, Observation, Scenario } from "./types.ts";

type Step = "setup" | "generate" | "compile" | "start";

// Generated discovery files only select a scenario. Assertions remain Vitest's.
export function scenario(name: string) {
	test(name, ({ signal }) => withCommands(signal, () => run(name)));
}

async function run(name: string) {
	const source = join(scenarios, name);
	const directory = await mkdtemp(join(tmpdir(), `typesql-${name}-`));
	const internal = join(directory, ".scenario");
	const observed: Observation = {};
	let stage = "prepare";
	let database: Allocation | undefined;
	// Paths and URLs of this run, replaced in the snapshot and in failure logs.
	const normalized = () => {
		let text = JSON.stringify(observed)
			.replaceAll(directory, "<scenario>")
			.replaceAll(repository, "<workspace>");
		if (database?.env.DATABASE_URL)
			text = text.replaceAll(database.env.DATABASE_URL, "<database-url>");
		return JSON.parse(text.replace(/\(node:\d+\)/g, "(node:<pid>)"));
	};
	try {
		const manifest = await prepare(source, directory);
		const failure = manifest.scenario?.failure;
		if (
			failure &&
			((failure.stage !== "compile" && !manifest.scripts?.[failure.stage]) ||
				failure.exitCode <= 0)
		)
			throw new Error("Invalid expected failure contract");
		database = await allocate(manifest.scenario?.database, directory);
		const { env } = database;

		const script = async (step: Step, extra: NodeJS.ProcessEnv = {}) => {
			stage = step;
			const argv = manifest.scripts?.[step]
				? ["pnpm", "--silent", "run", step]
				: [
						join(directory, "node_modules", ".bin", "tsc"),
						"-p",
						"tsconfig.json",
						"--pretty",
						"false",
					];
			const result = await command(directory, argv, {
				env: { ...env, ...extra },
				logs: join(internal, "logs"),
			});
			observed[step] = {
				status: result.status,
				stdout: result.stdout,
				stderr: result.stderr,
			};
			if (
				result.status !== 0 &&
				(failure?.stage !== step || result.status !== failure.exitCode)
			)
				throw new Error(
					`Unexpected ${step} failure (${result.status})\n${result.stdout}${result.stderr}`,
				);
			if (failure?.stage === step && result.status === 0)
				throw new Error(
					`Expected ${step} to fail with ${failure.exitCode}, but it succeeded`,
				);
			return result.status === 0;
		};

		const start = async () => {
			const errorFile = join(internal, "exception.json");
			const started = await script("start", {
				SCENARIO_ERROR_FILE: errorFile,
				NODE_OPTIONS: `--import=${join(import.meta.dirname, "runtime.ts")}`,
			});
			if (started) return;
			try {
				observed.exception = JSON.parse(await readFile(errorFile, "utf8"));
			} catch {
				throw new Error(
					"Infrastructure: expected application exception was not observed",
				);
			}
			// Node's report of the exception repeats it with a stack trace.
			delete observed.start?.stderr;
		};

		const stages = async () => {
			for (const step of ["setup", "generate"] as const)
				if (manifest.scripts?.[step] && !(await script(step))) return;
			if (manifest.scripts?.generate) {
				stage = "generated artifacts";
				for (const file of manifest.scenario?.artifacts ?? [])
					await access(artifact(directory, file));
			}
			const compiled = await script("compile");
			stage = "types and diagnostics";
			const output = join(internal, "compiler.json");
			await required(directory, [
				"node",
				join(import.meta.dirname, "observe.ts"),
				output,
			]);
			const compiler: CompilerObservation = JSON.parse(
				await readFile(output, "utf8"),
			);
			observed.compiler = compiler;
			if (compiled !== (compiler.diagnostics.length === 0))
				throw new Error(
					"Compiler command and observer disagree about diagnostics",
				);
			// The compiler's output repeats the observed diagnostics.
			if (!compiled) delete observed.compile?.stdout;
			if (compiled && manifest.scripts?.start) await start();
			stage = "artifacts";
			const files: Record<string, string> = {};
			for (const file of manifest.scenario?.artifacts ?? [])
				files[file] = await readFile(artifact(directory, file), "utf8");
			if (Object.keys(files).length) observed.artifacts = files;
		};

		await stages();
		stage = "snapshot";
		expect(normalized()).toMatchSnapshot("scenario");
	} catch (cause) {
		const retained = join(artifacts, name);
		await rm(retained, { recursive: true, force: true });
		await mkdir(internal, { recursive: true });
		await writeFile(
			join(internal, "failure.json"),
			JSON.stringify(
				{ name, stage, observed: normalized(), error: String(cause) },
				null,
				2,
			),
		);
		await unlessMissing(
			cp(join(source, "expected.snap"), join(internal, "expected.snap")),
		);
		await cp(directory, retained, { recursive: true });
		throw new Error(
			`${name}: failed at ${stage}. Scenario and logs retained at ${retained}`,
			{ cause },
		);
	} finally {
		await database?.cleanup();
		await rm(directory, { recursive: true, force: true });
	}
}

function artifact(directory: string, file: string) {
	const path = resolve(directory, file);
	if (!path.startsWith(`${directory}/`))
		throw new Error(`Artifact escapes scenario: ${file}`);
	return path;
}

async function prepare(source: string, directory: string) {
	await cp(source, directory, {
		recursive: true,
		filter: (path) =>
			!["node_modules", "dist", ".scenario", "expected.snap"].includes(
				basename(path),
			),
	});
	await symlink(
		join(source, "node_modules"),
		join(directory, "node_modules"),
		"dir",
	);
	await mkdir(join(directory, ".scenario"));
	const config = JSON.parse(
		await readFile(join(scenarios, "tsconfig.base.json"), "utf8"),
	);
	const configPath = join(directory, "tsconfig.json");
	const text = await unlessMissing(readFile(configPath, "utf8"));
	if (text !== undefined) {
		const overrides = JSON.parse(text);
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
	}
	await writeFile(configPath, JSON.stringify(config, null, 2));
	const manifest: Scenario = JSON.parse(
		await readFile(join(directory, "package.json"), "utf8"),
	);
	return manifest;
}
