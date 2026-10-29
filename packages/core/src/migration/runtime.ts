import { createHash } from "node:crypto";
import type { Executor, ExecutorResult } from "../query.js";
import { createMigrationContext } from "./context.js";
import { discoverMigrations, type MigrationFile } from "./files.js";

export interface MigrationOptions {
	readonly dialect: "postgres" | "sqlite";
	readonly migrationsDir: string;
	readonly migrationTable?: string;
	/** A dedicated connection, kept open and unused by other work until completion. */
	readonly execute: Executor;
}

export interface MigrationResult {
	readonly direction: "up" | "down";
	readonly migrations: readonly string[];
}

interface AppliedMigration {
	readonly name: string;
	readonly hash: string;
}

export function migrateUp(options: MigrationOptions): Promise<MigrationResult> {
	return migrate(options, "up", false);
}

export function migrateDown(
	options: MigrationOptions,
): Promise<MigrationResult> {
	return migrate(options, "down", false);
}

export function migrateLatest(
	options: MigrationOptions,
): Promise<MigrationResult> {
	return migrate(options, "up", true);
}

function identifier(name: string): string {
	if (!name || name.includes("\0"))
		throw new Error(
			"Migration table and schema names must be nonempty and contain no NUL",
		);
	return `"${name.replaceAll('"', '""')}"`;
}

async function rows(
	execute: Executor,
	text: string,
	values: readonly unknown[] = [],
): Promise<readonly unknown[]> {
	const result = await execute(text, values);
	return Array.isArray(result) ? result : (result as ExecutorResult).rows;
}

function readHistory(records: readonly unknown[]): AppliedMigration[] {
	return records.map((record) => {
		if (
			typeof record !== "object" ||
			record === null ||
			!("name" in record) ||
			typeof record.name !== "string" ||
			!("hash" in record) ||
			typeof record.hash !== "string"
		)
			throw new Error(
				"Invalid migration history: expected string name and hash columns",
			);
		return { name: record.name, hash: record.hash };
	});
}

function validateHistory(
	files: readonly MigrationFile[],
	applied: readonly AppliedMigration[],
): void {
	const byName = new Map(files.map((file) => [file.name, file]));
	const appliedNames = new Set(applied.map((file) => file.name));
	let latest = "";
	for (const entry of applied) {
		const file = byName.get(entry.name);
		if (!file) throw new Error(`Applied migration is missing: ${entry.name}`);
		if (file.hash !== entry.hash)
			throw new Error(`Applied migration has changed: ${entry.name}`);
		if (entry.name > latest) latest = entry.name;
	}
	for (const file of files)
		if (!appliedNames.has(file.name) && file.name < latest)
			throw new Error(
				`Pending migration sorts before an applied migration: ${file.name}`,
			);
}

async function migrate(
	options: MigrationOptions,
	direction: "up" | "down",
	all: boolean,
): Promise<MigrationResult> {
	if (options.dialect !== "postgres" && options.dialect !== "sqlite")
		throw new Error(
			`Unsupported migration dialect: ${String(options.dialect)}`,
		);
	const files = await discoverMigrations(options.migrationsDir);
	const tableName = options.migrationTable ?? "schema_migrations";
	let table = identifier(tableName);
	const execute = options.execute;
	const postgres = options.dialect === "postgres";
	let lock: string | undefined;
	if (postgres) {
		const [location] = await rows(
			execute,
			"SELECT current_schema() AS schema, current_database() AS database, current_setting('max_identifier_length')::integer AS max_identifier_length",
		);
		if (
			typeof location !== "object" ||
			location === null ||
			!("schema" in location) ||
			typeof location.schema !== "string" ||
			!("database" in location) ||
			typeof location.database !== "string" ||
			!("max_identifier_length" in location) ||
			typeof location.max_identifier_length !== "number"
		)
			throw new Error("Cannot determine the PostgreSQL migration schema");
		if (Buffer.byteLength(tableName, "utf8") > location.max_identifier_length)
			throw new Error(
				`Migration table name exceeds PostgreSQL's ${location.max_identifier_length}-byte identifier limit`,
			);
		table = `${identifier(location.schema)}.${table}`;
		lock = createHash("sha256")
			.update(JSON.stringify([location.database, location.schema, tableName]))
			.digest()
			.readBigInt64BE()
			.toString();
		await execute("SELECT pg_advisory_lock($1::bigint)", [lock]);
	}
	const completed: string[] = [];

	try {
		for (;;) {
			await execute(postgres ? "BEGIN" : "BEGIN IMMEDIATE", []);
			try {
				await execute(
					`CREATE TABLE IF NOT EXISTS ${table} (name TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at ${postgres ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
					[],
				);
				// SQLite must read history only after obtaining its write lock.
				const history = readHistory(
					await rows(execute, `SELECT name, hash FROM ${table}`),
				);
				validateHistory(files, history);
				const applied = new Set(history.map((file) => file.name));
				const selected =
					direction === "up"
						? files.find((file) => !applied.has(file.name))
						: files.findLast((file) => applied.has(file.name));
				if (!selected) {
					await execute("ROLLBACK", []);
					break;
				}
				const migration = await selected.load();
				let active = true;
				const checkActiveSql = (sql: string): void => {
					if (!active)
						throw new Error(
							"Migration context cannot execute after its migration has finished",
						);
					assertMigrationSql(sql, options.dialect);
				};
				const count = execute.count;
				const guarded: Executor = Object.assign(
					async (sql: string, values: readonly unknown[]) => {
						checkActiveSql(sql);
						return execute(sql, values);
					},
					count === undefined
						? {}
						: {
								count: async (sql: string, values: readonly unknown[]) => {
									checkActiveSql(sql);
									return count(sql, values);
								},
							},
				);
				try {
					const context = createMigrationContext(options.dialect, guarded);
					await migration[direction](context as never);
				} finally {
					active = false;
				}
				if (direction === "up")
					await execute(`INSERT INTO ${table} (name, hash) VALUES ($1, $2)`, [
						selected.name,
						selected.hash,
					]);
				else
					await execute(`DELETE FROM ${table} WHERE name = $1`, [
						selected.name,
					]);
				await execute("COMMIT", []);
				completed.push(selected.name);
			} catch (error) {
				try {
					await execute("ROLLBACK", []);
				} catch (rollbackError) {
					throw new AggregateError(
						[error, rollbackError],
						"Migration failed and rollback also failed",
					);
				}
				throw error;
			}
			if (!all) break;
		}
		return { direction, migrations: completed };
	} finally {
		if (lock !== undefined)
			await execute("SELECT pg_advisory_unlock($1::bigint)", [lock]);
	}
}

/** Keep transaction ownership with the runner, including multi-statement raw SQL. */
function assertMigrationSql(
	sql: string,
	dialect: MigrationOptions["dialect"],
): void {
	const words: string[] = [];
	const checkRollback = (): void => {
		if (
			words[0] === "ROLLBACK" &&
			words[1] !== "TO" &&
			!(
				(words[1] === "WORK" || words[1] === "TRANSACTION") &&
				words[2] === "TO"
			)
		)
			throw new Error(
				"Migrations cannot roll back their enclosing transaction; use ROLLBACK TO a savepoint",
			);
	};
	let trigger = false;
	let start = true;
	for (let i = 0; i < sql.length; ) {
		const char = sql.charAt(i);
		if (/\s/.test(char)) {
			i++;
			continue;
		}
		if (sql.startsWith("--", i)) {
			const end = /[\r\n]/.exec(sql.slice(i + 2));
			i = end === null ? sql.length : i + 2 + end.index + 1;
			continue;
		}
		if (sql.startsWith("/*", i)) {
			let depth = 1;
			i += 2;
			while (i < sql.length && depth > 0) {
				if (sql.startsWith("/*", i) && dialect === "postgres") {
					depth++;
					i += 2;
				} else if (sql.startsWith("*/", i)) {
					depth--;
					i += 2;
				} else i++;
			}
			continue;
		}
		if (
			char === "'" ||
			char === '"' ||
			(dialect === "sqlite" && (char === "`" || char === "["))
		) {
			const end = char === "[" ? "]" : char;
			const escapes =
				dialect === "postgres" &&
				char === "'" &&
				/[eE]/.test(sql[i - 1] ?? "") &&
				!/[\w$]/.test(sql[i - 2] ?? "");
			i++;
			while (i < sql.length) {
				if (escapes && sql[i] === "\\") i += 2;
				else if (sql[i] === end) {
					if (sql[i + 1] === end && char !== "[") i += 2;
					else {
						i++;
						break;
					}
				} else i++;
			}
			if (words.length < 4) words.push("");
			start = false;
			continue;
		}
		if (char === "$" && dialect === "postgres") {
			const tag = /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/.exec(sql.slice(i))?.[0];
			if (tag) {
				const end = sql.indexOf(tag, i + tag.length);
				i = end < 0 ? sql.length : end + tag.length;
				if (words.length < 4) words.push("");
				start = false;
				continue;
			}
		}
		if (char === ";") {
			checkRollback();
			words.length = 0;
			start = true;
			i++;
			continue;
		}
		const word = /^[a-zA-Z_][a-zA-Z_0-9$]*/.exec(sql.slice(i))?.[0];
		if (word) {
			const upper = word.toUpperCase();
			if (trigger && start && upper === "END") trigger = false;
			else if (
				!trigger &&
				start &&
				/^(BEGIN|START|COMMIT|END|ABORT)$/.test(upper)
			)
				throw new Error(
					"Migrations cannot control transactions; each migration runs in its own transaction",
				);
			if (words.length < 4) words.push(upper);
			if (
				words.length === 2 &&
				words[0] === "PREPARE" &&
				upper === "TRANSACTION"
			)
				throw new Error("Migrations cannot prepare transactions");
			if (
				dialect === "sqlite" &&
				upper === "TRIGGER" &&
				(words.join(" ") === "CREATE TRIGGER" ||
					words.join(" ") === "CREATE TEMP TRIGGER" ||
					words.join(" ") === "CREATE TEMPORARY TRIGGER")
			)
				trigger = true;
			start = false;
			i += word.length;
			continue;
		}
		if (words.length < 4) words.push("");
		start = false;
		i++;
	}
	checkRollback();
}
