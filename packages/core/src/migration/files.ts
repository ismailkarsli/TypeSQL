import { isMigration, MIGRATION_FROM } from "./define.js";

type Dialect = "postgres" | "sqlite";

/** The migration files of a directory, in the order they run. */
export async function migrationFiles(migrationsDir: string): Promise<string[]> {
	const { readdir } = process.getBuiltinModule("node:fs/promises");
	const { resolve } = process.getBuiltinModule("node:path");
	const entries = await readdir(migrationsDir, { withFileTypes: true }).catch(
		(error: unknown) => {
			if ((error as { code?: unknown }).code === "ENOENT")
				throw new Error(
					`typesql: the migrations directory does not exist: ${resolve(migrationsDir)}`,
					{ cause: error },
				);
			throw error;
		},
	);
	return entries
		.filter(
			(entry) =>
				(entry.isFile() || entry.isSymbolicLink()) &&
				entry.name.endsWith(".ts") &&
				!entry.name.endsWith(".d.ts"),
		)
		.map((entry) => entry.name)
		.sort();
}

/** File URLs of the migration directories whose imports are mapped. */
const directories = new Set<string>();

/**
 * Migrations import each other as `./name.js`, which TypeScript resolves to
 * `./name.ts`. Node doesn't, so a relative `.js` import that a migration
 * makes and that doesn't exist loads the `.ts` file beside it instead.
 */
function mapMigrationImports(directory: string): void {
	// Bun and Deno load the `.ts` file themselves, and have no registerHooks.
	const { registerHooks } = process.getBuiltinModule("node:module");
	if (typeof registerHooks !== "function") return;
	if (directories.size === 0)
		registerHooks({
			resolve(specifier, context, nextResolve) {
				try {
					return nextResolve(specifier, context);
				} catch (error) {
					const parent = context.parentURL;
					if (
						(error as { code?: unknown }).code !== "ERR_MODULE_NOT_FOUND" ||
						!/^\.\.?\/.*\.js$/.test(specifier) ||
						parent === undefined ||
						!directories.has(new URL(".", parent).href)
					)
						throw error;
					return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
				}
			},
		});
	directories.add(
		process.getBuiltinModule("node:url").pathToFileURL(`${directory}/`).href,
	);
}

/**
 * Import every migration file. A file default-exports its migration, or, as
 * in 3.x, exports `up` and `down`. Each file is imported once per process,
 * so a file's `import previous from "./x.js"` is the runner's migration.
 */
export async function loadMigrations(migrationsDir: string): Promise<
	{
		name: string;
		up: (db: never) => unknown;
		down: (db: never) => unknown;
		from: unknown;
		self: unknown;
	}[]
> {
	const { resolve } = process.getBuiltinModule("node:path");
	const { pathToFileURL } = process.getBuiltinModule("node:url");
	const directory = resolve(migrationsDir);
	const names = await migrationFiles(directory);
	mapMigrationImports(directory);
	const loaded = [];
	for (const name of names) {
		let module: Record<string, unknown>;
		try {
			module = await import(pathToFileURL(resolve(directory, name)).href);
		} catch (error) {
			// migration() is imported at runtime, so with pnpm a project that
			// only depends on @typesql/cli can't load its migrations.
			if (
				(error as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" &&
				String(error).includes("'@typesql/core")
			)
				throw new Error(
					`${(error as Error).message}; add @typesql/core to the project's dependencies (npm install @typesql/core, or pnpm add @typesql/core)`,
					{ cause: error },
				);
			throw error;
		}
		const defined = module.default;
		if (
			isMigration(defined) &&
			defined.name !== undefined &&
			defined.name !== name
		)
			throw new Error(
				`typesql: ${name} names its migration ${JSON.stringify(defined.name)}, but a migration file's name is its file name; remove the name`,
			);
		if (isMigration(defined))
			loaded.push({
				name,
				up: defined.up,
				down: defined.down,
				from: (defined as { [MIGRATION_FROM]?: unknown })[MIGRATION_FROM],
				self: defined,
			});
		else if (
			typeof module.up === "function" &&
			typeof module.down === "function"
		)
			loaded.push({
				name,
				up: module.up as (db: never) => unknown,
				down: module.down as (db: never) => unknown,
				from: undefined,
				// A later file starts from a 3.x file's up.
				self: module.up,
			});
		else
			throw new Error(
				`typesql: migration ${name} must default-export migration(…) (or, as in 3.x, export up and down functions)`,
			);
	}
	return loaded;
}

/** Create a migration file that starts from the last one, and return its path. */
export async function makeMigration(
	migrationsDir: string,
	name: string,
	dialect: Dialect,
): Promise<string> {
	if (!name.trim() || /[\\/\p{Cc}]/u.test(name))
		throw new Error(
			"typesql: a migration name must not be empty or contain path separators or control characters",
		);
	const { mkdir, readFile, writeFile } =
		process.getBuiltinModule("node:fs/promises");
	const { resolve } = process.getBuiltinModule("node:path");
	const directory = resolve(migrationsDir);
	const filename = `${Math.floor(Date.now() / 1000)}_${name.trim().replaceAll(" ", "-")}.ts`;
	await mkdir(directory, { recursive: true });
	const files = await migrationFiles(directory);
	if (files.includes(filename))
		throw new Error(`typesql: migration already exists: ${filename}`);
	const previous = files.at(-1);
	if (previous !== undefined && filename < previous)
		throw new Error(
			`typesql: new migration ${filename} would sort before existing migration ${previous}`,
		);
	// `previous` is imported as .js, which TypeScript resolves to the .ts file
	// without allowImportingTsExtensions; the runner maps it for Node. A 3.x
	// file has no default export, so the new one starts from its up.
	let from = JSON.stringify(dialect);
	const imports = ['import { migration } from "@typesql/core/migration";'];
	if (previous !== undefined) {
		from = "previous";
		const specifier = JSON.stringify(`./${previous.replace(/\.ts$/, ".js")}`);
		const legacy = !/^\s*export\s+default\b/m.test(
			await readFile(resolve(directory, previous), "utf8"),
		);
		imports.push(
			legacy
				? `import { up as previous } from ${specifier};`
				: `import previous from ${specifier};`,
		);
	}
	const source = [
		...imports,
		"",
		`export default migration(${from}, {`,
		"\tup: async (db) => {",
		"\t\treturn db;",
		"\t},",
		"\tdown: async (db) => {},",
		"});",
		"",
	].join("\n");
	const file = resolve(directory, filename);
	await writeFile(file, source, { flag: "wx" });
	return file;
}
