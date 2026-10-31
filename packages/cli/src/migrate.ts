import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SQLInputValue } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { paramNumbers, sqliteValue } from "@typesql/core/adapter";
import {
	type MigrationOptions,
	migrateDown,
	migrateLatest,
	migrateUp,
} from "@typesql/core/migration";
import {
	generateSchema,
	migrationFiles,
	type SchemaPoint,
} from "./generate.js";

/** Default export of typesql.config.ts. Relative paths are resolved beside it. */
export interface MigrationConfig {
	readonly dialect: "postgres" | "sqlite";
	readonly url?: string;
	readonly db?: string;
	readonly migrationsDir?: string;
	readonly migrationTable?: string;
	/** Where `typesql migrate generate` writes the schema (default: db.ts). */
	readonly schemaFile?: string;
	/** Regenerate the schema file after up, down and latest (default: true). */
	readonly generate?: boolean;
}

interface Io {
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string | undefined>>;
}

const USAGE = `Usage: typesql migrate <up|down|latest|make name|generate> [options]

  up                  apply the next migration
  down                revert the last applied migration
  latest              apply every pending migration
  make <name>         create a TypeScript migration linked to its predecessor
  generate            write the schema of the last migration to a DB file

Options:
  --config <file>     config module (default: ./typesql.config.ts)
  --dialect <name>    postgres or sqlite; overrides config
  --url <url>         PostgreSQL URL (default: config.url or $DATABASE_URL)
  --db <file>         SQLite database file; overrides config
  --dir <directory>   migrations directory; overrides config
  --out <file>        schema file to write (default: config.schemaFile or db.ts)
  --no-generate       don't write the schema file after up, down or latest
  -h, --help          show this help

Config defaults to migrations/ beside the config file, or the working directory.
up, down and latest then write the schema of the last applied migration, unless
config.generate is false. Each migration must export up and down functions.
Requires Node.js 26 or newer.
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

async function configuration(file: string, explicit: boolean) {
	try {
		await stat(file);
	} catch (error) {
		if (!explicit && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return {};
		}
		throw error;
	}
	const module = (await import(pathToFileURL(file).href)) as {
		default?: unknown;
	};
	const config = module.default;
	if (config === null || typeof config !== "object" || Array.isArray(config)) {
		throw new Error(`${file} must default-export a configuration object`);
	}
	for (const key of [
		"dialect",
		"url",
		"db",
		"migrationsDir",
		"migrationTable",
		"schemaFile",
	]) {
		const value = (config as Record<string, unknown>)[key];
		if (value !== undefined && (typeof value !== "string" || !value)) {
			throw new Error(`config.${key} must be a non-empty string`);
		}
	}
	const generate = (config as Record<string, unknown>).generate;
	if (generate !== undefined && typeof generate !== "boolean") {
		throw new Error("config.generate must be a boolean");
	}
	return config as Partial<MigrationConfig>;
}

async function makeMigration(
	directory: string,
	name: string,
	dialect: MigrationConfig["dialect"],
): Promise<string> {
	if (!name.trim() || /[\\/\p{Cc}]/u.test(name)) {
		throw new Error(
			"migration name must not be empty or contain path separators or control characters",
		);
	}
	const filename = `${Math.floor(Date.now() / 1000)}_${name.replaceAll(" ", "-")}.ts`;
	await mkdir(directory, { recursive: true });
	const files = (await readdir(directory, { withFileTypes: true }))
		.filter(
			(file) =>
				(file.isFile() || file.isSymbolicLink()) && file.name.endsWith(".ts"),
		)
		.map((file) => file.name)
		.sort();
	if (files.includes(filename)) {
		throw new Error(`migration already exists: ${filename}`);
	}
	const previous = files.at(-1);
	if (previous !== undefined && filename < previous) {
		throw new Error(
			`new migration ${filename} would sort before existing migration ${previous}`,
		);
	}
	const context =
		dialect === "postgres" ? "PostgresMigration" : "SqliteMigration";
	const source =
		previous === undefined
			? `import type { ${context}, MigrationSchema } from "@typesql/core/migration";\n\nexport async function up(db: ${context}) {\n\treturn db;\n}\n\nexport async function down(_db: ${context}<MigrationSchema<typeof up>>) {}\n`
			: `import type { ${context}, MigrationSchema } from "@typesql/core/migration";\nimport type { up as previousUp } from ${JSON.stringify(`./${previous}`)};\n\nexport async function up(db: ${context}<MigrationSchema<typeof previousUp>>) {\n\treturn db;\n}\n\nexport async function down(_db: ${context}<MigrationSchema<typeof up>>) {}\n`;
	const file = resolve(directory, filename);
	await writeFile(file, source, { flag: "wx" });
	return file;
}

// pg rejects a refused `localhost` connection (IPv4 and IPv6) with an
// AggregateError whose own message is empty.
const message = (err: unknown): string => {
	if (!(err instanceof Error)) return String(err);
	if (err.message) return err.message;
	if (err instanceof AggregateError && err.errors.length > 0)
		return [...new Set(err.errors.map(message))].join("; ");
	return (err as { code?: string }).code ?? err.name;
};

async function connectPostgres(url: string) {
	if (!URL.canParse(url) && !url.startsWith("/"))
		throw new Error(
			`invalid connection URL ${JSON.stringify(url)} (expected postgres://user:password@host:port/database)`,
		);
	let Client: typeof import("pg").Client;
	try {
		({ Client } = (await import("pg")).default);
	} catch {
		throw new Error('the "pg" package is not installed: npm install pg');
	}
	const client = new Client({ connectionString: url });
	await client.connect();
	return {
		execute: (async (sql, values) => {
			const result = await client.query(sql, [...values]);
			return Array.isArray(result)
				? (result.at(-1) ?? { rows: [], rowCount: 0 })
				: result;
		}) satisfies MigrationOptions["execute"],
		close: () => client.end(),
	};
}

async function connectSqlite(file: string) {
	const { DatabaseSync } = await import("node:sqlite");
	const db = new DatabaseSync(file);
	// Wait for the current migration transaction instead of failing immediately.
	db.exec("PRAGMA busy_timeout = 30000");
	return {
		execute: (async (sql, values) => {
			let rest = sql;
			let rows: Record<string, unknown>[] = [];
			let rowCount = 0;
			while (rest.trim()) {
				rest = rest.replace(
					/^(?:\s+|;|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?(?:\*\/|$))+/,
					"",
				);
				if (!rest) break;
				const statement = db.prepare(rest);
				const consumed = statement.sourceSQL.length;
				if (!consumed) break;
				const numbers = paramNumbers(statement.sourceSQL);
				const bindings: Record<string, SQLInputValue> = {};
				for (const number of numbers) {
					bindings[`$${number}`] = sqliteValue(
						values[number - 1],
					) as SQLInputValue;
				}
				const positional = values.map(sqliteValue) as SQLInputValue[];
				if (statement.columns().length) {
					rows = numbers.length
						? statement.all(bindings)
						: statement.all(...positional);
					rowCount = rows.length;
				} else {
					const result = numbers.length
						? statement.run(bindings)
						: statement.run(...positional);
					rows = [];
					rowCount = Number(result.changes);
				}
				rest = rest.slice(consumed);
			}
			return { rows, rowCount };
		}) satisfies MigrationOptions["execute"],
		close: async () => db.close(),
	};
}

/**
 * The schema the database has after a command. Applied migrations are always a
 * prefix of the sorted files, so the command's result locates the last one.
 */
function appliedPoint(
	files: readonly string[],
	command: string,
	changed: readonly string[],
): SchemaPoint {
	const first = files[0];
	if (first === undefined) return { empty: true };
	if (command === "down") {
		const reverted = changed[0];
		const index = reverted === undefined ? 0 : files.indexOf(reverted);
		const previous = files[index - 1];
		return previous === undefined ? { before: first } : { after: previous };
	}
	const applied =
		command === "up" ? (changed[0] ?? files.at(-1)) : files.at(-1);
	return { after: applied ?? first };
}

export async function main(argv: readonly string[], io: Io): Promise<number> {
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(argv);
	} catch (error) {
		io.stderr(`typesql migrate: ${(error as Error).message}\n\n${USAGE}`);
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
		!["up", "down", "latest", "make", "generate"].includes(command) ||
		positionals.length !== (command === "make" ? 2 : 1)
	) {
		io.stderr(
			`typesql migrate: expected up, down, latest, make <name>, or generate\n\n${USAGE}`,
		);
		return 2;
	}
	try {
		const cwd = io.cwd ?? process.cwd();
		const configFile = resolve(cwd, values.config ?? "typesql.config.ts");
		const config = await configuration(configFile, values.config !== undefined);
		const base = dirname(configFile);
		const dialect = values.dialect ?? config.dialect;
		if (dialect !== "postgres" && dialect !== "sqlite") {
			throw new Error(
				"set dialect to postgres or sqlite in config or pass --dialect",
			);
		}
		const migrationsDir =
			values.dir === undefined
				? resolve(base, config.migrationsDir ?? "migrations")
				: resolve(cwd, values.dir);
		if (command === "make") {
			io.stdout(
				`typesql migrate: created ${await makeMigration(migrationsDir, positionals[1] ?? "", dialect)}\n`,
			);
			return 0;
		}
		const generate = async (point: SchemaPoint) => {
			const out =
				values.out === undefined
					? resolve(base, config.schemaFile ?? "db.ts")
					: resolve(cwd, values.out);
			const source = generateSchema({ migrationsDir, point, dialect });
			await mkdir(dirname(out), { recursive: true });
			await writeFile(out, source);
			io.stdout(`typesql migrate: generated ${out}\n`);
		};
		if (command === "generate") {
			const last = (await migrationFiles(migrationsDir)).at(-1);
			await generate(last === undefined ? { empty: true } : { after: last });
			return 0;
		}
		const url =
			values.url ?? config.url ?? (io.env ?? process.env).DATABASE_URL;
		const db = values.db ?? config.db;
		let connection: Awaited<
			ReturnType<typeof connectPostgres | typeof connectSqlite>
		>;
		if (dialect === "postgres") {
			if (!url)
				throw new Error("pass --url, set config.url, or set DATABASE_URL");
			connection = await connectPostgres(url);
		} else {
			if (!db) throw new Error("pass --db or set config.db");
			connection = await connectSqlite(
				db === ":memory:"
					? db
					: resolve(values.db === undefined ? base : cwd, db),
			);
		}
		let changed: readonly string[];
		try {
			const run =
				command === "up"
					? migrateUp
					: command === "down"
						? migrateDown
						: migrateLatest;
			const result = await run({
				dialect,
				migrationsDir,
				execute: connection.execute,
				...(config.migrationTable === undefined
					? {}
					: { migrationTable: config.migrationTable }),
			});
			if (result.migrations.length === 0) {
				io.stdout(
					`typesql migrate: no ${command === "down" ? "applied" : "pending"} migrations\n`,
				);
			} else {
				for (const name of result.migrations) {
					io.stdout(
						`typesql migrate: ${result.direction === "down" ? "reverted" : "applied"} ${name}\n`,
					);
				}
			}
			changed = result.migrations;
		} finally {
			await connection.close();
		}
		if (values.generate ?? config.generate ?? true) {
			await generate(
				appliedPoint(await migrationFiles(migrationsDir), command, changed),
			);
		}
		return 0;
	} catch (error) {
		io.stderr(`typesql migrate: ${message(error)}\n`);
		return 1;
	}
}
