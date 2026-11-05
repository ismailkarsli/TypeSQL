import { stat } from "node:fs/promises";
import { registerHooks } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
	createMigrator,
	type DownResult,
	isMigrator,
	type MigrationError,
	type Migrator,
	type MigratorConfig,
	type UpResult,
} from "@typesql/core/migration";

interface Io {
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string | undefined>>;
}

const COMMANDS = ["latest", "up", "down", "status", "make", "generate"];

const USAGE = `Usage: typesql migrate <latest|up|down|status|make name|generate> [options]

  latest              apply every pending migration
  up                  apply the next pending migration
  down                revert the last applied migration
  status              list applied and pending migrations
  make <name>         create a migration file that starts from the last one
  generate            write the schema of the last migration to a DB file

Options:
  --config <file>     config module (default: ./typesql.config.ts)
  --dialect <name>    postgres, sqlite, mysql or mariadb; overrides config
  --url <url>         PostgreSQL, MySQL or MariaDB URL; overrides config
                      (default: $DATABASE_URL)
  --db <file>         SQLite database file; overrides config
  --dir <directory>   migrations directory; overrides config
  --out <file>        schema file to write (default: config.schemaFile or db.ts)
  --no-generate       don't write the schema file after up, down or latest
  -h, --help          show this help

The config file default-exports a migrator:

  import { createMigrator } from "@typesql/core/migration";
  export default createMigrator({ dialect: "postgres", url: process.env.DATABASE_URL, migrationsDir: "./migrations" });

Without a config file, pass --dialect and --url or --db; the directory
defaults to ./migrations. Paths in the config are relative to it, and paths
in flags to the working directory. Requires Node.js 26 or newer.
`;

const parse = (argv: readonly string[]) =>
	parseArgs({
		args: [...argv],
		allowPositionals: true,
		allowNegative: true,
		options: {
			config: { type: "string" },
			dialect: { type: "string" },
			url: { type: "string" },
			db: { type: "string" },
			dir: { type: "string" },
			out: { type: "string" },
			generate: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});

let mapped = false;

/**
 * A TypeScript project's files import each other as `./name.js`, which
 * TypeScript resolves to `./name.ts`; Node doesn't. While the config loads,
 * such an import from a `.ts` file outside node_modules loads the `.ts` file
 * when there is no `.js` one, so an array config can import its migrations.
 */
function mapTypeScriptImports(): void {
	if (mapped) return;
	mapped = true;
	registerHooks({
		resolve(specifier, context, nextResolve) {
			try {
				return nextResolve(specifier, context);
			} catch (error) {
				const parent = context.parentURL;
				if (
					!hasCode(error, "ERR_MODULE_NOT_FOUND") ||
					!/^\.\.?\/.*\.[cm]?js$/.test(specifier) ||
					parent === undefined ||
					!/^file:.*\.[cm]?ts$/.test(parent) ||
					parent.includes("/node_modules/")
				)
					throw error;
				return nextResolve(specifier.replace(/js$/, "ts"), context);
			}
		},
	});
}

/** The config file's migrator, with its relative paths resolved beside the file. */
async function configured(
	file: string,
	explicit: boolean,
): Promise<Migrator | undefined> {
	try {
		await stat(file);
	} catch (error) {
		if (!explicit && hasCode(error, "ENOENT")) return undefined;
		throw error;
	}
	mapTypeScriptImports();
	const module: { readonly default?: unknown } = await import(
		pathToFileURL(file).href
	);
	const migrator = module.default;
	if (!isMigrator(migrator))
		throw new Error(
			`${file} must default-export a migrator: export default createMigrator({ … }) from @typesql/core/migration`,
		);
	const base = dirname(file);
	const { config } = migrator;
	const paths: Record<string, string> = {};
	for (const key of ["migrationsDir", "schemaFile", "db"] as const) {
		const value = config[key];
		if (value !== undefined && value !== ":memory:" && !isAbsolute(value))
			paths[key] = resolve(base, value);
	}
	if (config.schemaFile === undefined && config.migrationsDir !== undefined)
		paths.schemaFile = join(base, "db.ts");
	return Object.keys(paths).length > 0 ? migrator.with(paths) : migrator;
}

/** Whether `node_modules/<name>` exists in `directory` or one of its parents. */
async function installed(directory: string, name: string): Promise<boolean> {
	for (let dir = directory; ; dir = dirname(dir)) {
		try {
			await stat(join(dir, "node_modules", name, "package.json"));
			return true;
		} catch {}
		if (dirname(dir) === dir) return false;
	}
}

/** Whether `error` carries the `code` Node sets. */
function hasCode(
	error: unknown,
	code: string,
): error is { readonly code: string } {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === code
	);
}

const DIALECTS: readonly string[] = ["postgres", "sqlite", "mysql", "mariadb"];

const isDialect = (value: unknown): value is MigratorConfig["dialect"] =>
	typeof value === "string" && DIALECTS.includes(value);

/** Whether `error` is a MigrationError from any copy of `@typesql/core`. */
function isMigrationError(error: unknown): error is MigrationError {
	return error instanceof Error && error.name === "MigrationError";
}

// pg rejects a refused `localhost` connection (IPv4 and IPv6) with an
// AggregateError whose own message is empty.
const message = (cause: unknown): string => {
	if (!(cause instanceof Error)) return String(cause);
	const text = cause.message
		? cause.message
		: cause instanceof AggregateError && cause.errors.length > 0
			? Array.from(new Set(cause.errors.map(message))).join("; ")
			: "code" in cause && typeof cause.code === "string"
				? cause.code
				: cause.name;
	return text.replace(/^typesql: /, "");
};

/** 0: done, 1: the command failed, 2: a usage error. */
type ExitCode = 0 | 1 | 2;

/** The config the flags replace. */
interface Overrides {
	dialect?: MigratorConfig["dialect"];
	url?: string;
	db?: string;
	migrationsDir?: string;
	schemaFile?: string;
	generate?: boolean;
}

export async function main(argv: readonly string[], io: Io): Promise<ExitCode> {
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(argv);
	} catch (error) {
		io.stderr(`typesql migrate: ${message(error)}\n\n${USAGE}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help) {
		io.stdout(USAGE);
		return 0;
	}
	const command = positionals[0];
	if (
		!command ||
		!COMMANDS.includes(command) ||
		positionals.length !== (command === "make" ? 2 : 1)
	) {
		io.stderr(
			`typesql migrate: expected latest, up, down, status, make <name>, or generate\n\n${USAGE}`,
		);
		return 2;
	}
	const print = (text: string) => io.stdout(`typesql migrate: ${text}\n`);
	try {
		const cwd = io.cwd ?? process.cwd();
		const env = io.env ?? process.env;
		const from = (path: string) => resolve(cwd, path);
		let migrator = await configured(
			from(values.config ?? "typesql.config.ts"),
			values.config !== undefined,
		);
		const dialect = values.dialect ?? migrator?.config.dialect;
		if (!isDialect(dialect))
			throw new Error(
				migrator === undefined
					? "no typesql.config.ts: pass --dialect postgres, sqlite, mysql or mariadb, or pass --config"
					: `unsupported dialect: ${String(dialect)} (expected postgres, sqlite, mysql or mariadb)`,
			);
		const overrides: Overrides = {};
		if (values.dialect !== undefined) overrides.dialect = dialect;
		if (values.url !== undefined) overrides.url = values.url;
		if (values.db !== undefined)
			overrides.db = values.db === ":memory:" ? values.db : from(values.db);
		if (values.dir !== undefined) overrides.migrationsDir = from(values.dir);
		if (values.out !== undefined) overrides.schemaFile = from(values.out);
		if (values.generate !== undefined) overrides.generate = values.generate;
		const connected = (config: Partial<MigratorConfig> | undefined) =>
			config?.url !== undefined ||
			config?.db !== undefined ||
			config?.execute !== undefined;
		// The URL dialects fall back to DATABASE_URL, as `typesql introspect` does.
		if (
			dialect !== "sqlite" &&
			!connected(overrides) &&
			!(migrator !== undefined && connected(migrator.config)) &&
			env.DATABASE_URL
		)
			overrides.url = env.DATABASE_URL;
		migrator =
			migrator === undefined
				? createMigrator<unknown>({
						migrationsDir: from("migrations"),
						schemaFile: from("db.ts"),
						...overrides,
						dialect,
					})
				: migrator.with<unknown>(overrides);

		switch (command) {
			case "make": {
				const created = await migrator.make(positionals[1] ?? "");
				print(`created ${created}`);
				// The new file imports migration() from @typesql/core/migration.
				// A package manager with strict layouts (pnpm) doesn't expose the
				// CLI's own @typesql/core to the project.
				if (!(await installed(dirname(created), "@typesql/core")))
					io.stderr(
						`typesql migrate: warning: @typesql/core/migration cannot be found from ${dirname(created)}, so the migration can't run and its types are unchecked; add @typesql/core to the project's dependencies (npm install @typesql/core, or pnpm add @typesql/core)\n`,
					);
				return 0;
			}
			case "generate":
				print(`generated ${await migrator.generate()}`);
				return 0;
			case "status": {
				const status = await migrator.status();
				if (status.length === 0) print("no migrations");
				for (const entry of status)
					io.stdout(
						`${entry.applied ? "applied" : "pending"}  ${entry.appliedAt?.toISOString() ?? "                        "}  ${entry.name}\n`,
					);
				return 0;
			}
		}
		const report = (
			names: readonly string[],
			write: { schemaFile?: string; schemaError?: Error },
		) => {
			for (const name of names)
				print(`${command === "down" ? "reverted" : "applied"} ${name}`);
			if (write.schemaFile !== undefined)
				print(`generated ${write.schemaFile}`);
			// The database is migrated by now: a schema file that can't be
			// written is a warning, and the exit code reports the migration.
			if (write.schemaError !== undefined)
				io.stderr(
					`typesql migrate: warning: the schema file was not updated: ${message(write.schemaError)}\n` +
						"typesql migrate: fix the cause, then run `typesql migrate generate`\n",
				);
		};
		let result: UpResult | DownResult;
		try {
			result =
				command === "down"
					? await migrator.down()
					: command === "up"
						? await migrator.up()
						: await migrator.latest();
		} catch (error) {
			// The migrations before the one that failed stay applied.
			if (isMigrationError(error)) report(error.applied, error);
			throw error;
		}
		const names = "reverted" in result ? result.reverted : result.applied;
		if (names.length === 0)
			print(`no ${command === "down" ? "applied" : "pending"} migrations`);
		report(names, result);
		return 0;
	} catch (error) {
		io.stderr(`typesql migrate: ${message(error)}\n`);
		return 1;
	}
}
