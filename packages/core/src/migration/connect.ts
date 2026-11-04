import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
import { paramNumbers, sqliteValue } from "../adapter.js";
import type { Executor } from "../query.js";
import { runtimeImport } from "./node.js";

interface Connection {
	readonly execute: Executor;
	close(): Promise<void>;
}

// pg rejects a refused `localhost` connection (IPv4 and IPv6) with an
// AggregateError whose own message is empty.
const message = (cause: unknown): string => {
	if (!(cause instanceof Error)) return String(cause);
	if (cause.message) return cause.message;
	if (cause instanceof AggregateError && cause.errors.length > 0)
		return Array.from(new Set(cause.errors.map(message))).join("; ");
	return "code" in cause && typeof cause.code === "string"
		? cause.code
		: cause.name;
};

type Pg = typeof import("pg");

/** Whether `module` is the `pg` package, with its `Client`. */
function isPg(module: unknown): module is Pg {
	return (
		typeof module === "object" &&
		module !== null &&
		"default" in module &&
		typeof module.default === "object" &&
		module.default !== null &&
		"Client" in module.default &&
		typeof module.default.Client === "function"
	);
}

/** One `pg` client for a migrator call. */
export async function connectPostgres(url: string): Promise<Connection> {
	if (!URL.canParse(url) && !url.startsWith("/"))
		throw new Error(
			`typesql: invalid connection URL ${JSON.stringify(url)} (expected postgres://user:password@host:port/database)`,
		);
	let Client: Pg["Client"];
	try {
		({ Client } = (await runtimeImport("pg", isPg)).default);
	} catch (cause) {
		throw new Error(
			'typesql: url connects with the "pg" package, which is not installed: npm install pg',
			{ cause },
		);
	}
	const client = new Client({ connectionString: url });
	// The server can end the session between queries (a timeout, a failover,
	// pg_terminate_backend). Without a listener, pg's 'error' event would end
	// the process; the next query rejects with the error instead.
	let lost: Error | undefined;
	client.on("error", (error) => {
		lost ??= error;
	});
	try {
		await client.connect();
	} catch (error) {
		throw new Error(
			`typesql: cannot connect to PostgreSQL: ${message(error)}`,
			{
				cause: error,
			},
		);
	}
	return {
		execute: async (sql, values) => {
			if (lost) throw lost;
			const result = await client
				.query(sql, [...values])
				.catch((cause: unknown) => {
					// A session ended during a query rejects it with the server's
					// FATAL error; later queries get pg's own "connection
					// terminated" errors, so the server's message is the one to keep.
					if (
						cause instanceof Error &&
						"severity" in cause &&
						(cause.severity === "FATAL" || cause.severity === "PANIC")
					)
						lost ??= cause;
					throw cause;
				});
			return Array.isArray(result)
				? (result.at(-1) ?? { rows: [], rowCount: 0 })
				: result;
		},
		close: async () => {
			await client.end().catch((cause: unknown) => {
				if (!lost) throw cause;
			});
		},
	};
}

/** How long a statement waits for another connection's lock. */
const BUSY_LIMIT = 30_000;

/**
 * Run a statement, waiting while another connection holds the database's
 * lock. busy_timeout would wait inside SQLite and block the event loop, so a
 * connection of the same process holding the lock could never release it.
 */
async function whenFree<T>(step: () => T): Promise<T> {
	const start = Date.now();
	for (let delay = 5; ; delay = Math.min(delay * 2, 100)) {
		try {
			return step();
		} catch (error) {
			// SQLITE_BUSY and its extended codes.
			const busy =
				typeof error === "object" &&
				error !== null &&
				"errcode" in error &&
				typeof error.errcode === "number" &&
				(error.errcode & 0xff) === 5;
			if (!busy || Date.now() - start >= BUSY_LIMIT) throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}

/** Whether node:sqlite can bind `value` to a parameter. */
function isSqliteInput(value: unknown): value is SQLInputValue {
	return (
		value === null ||
		typeof value === "number" ||
		typeof value === "bigint" ||
		typeof value === "string" ||
		ArrayBuffer.isView(value)
	);
}

/** Parameter `number` (1-based) of `values`, as node:sqlite binds it. */
function bindable(values: readonly unknown[], number: number): SQLInputValue {
	const value = values[number - 1];
	if (isSqliteInput(value)) return value;
	throw new TypeError(
		`typesql: SQLite cannot bind ${typeof value} to parameter ${number}`,
	);
}

/** One `node:sqlite` database for a migrator call. */
export async function connectSqlite(file: string): Promise<Connection> {
	const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
	const db = new DatabaseSync(file);
	return {
		execute: async (sql, values) => {
			let rest = sql;
			let rows: Record<string, SQLOutputValue>[] = [];
			let rowCount = 0;
			while (rest.trim()) {
				rest = rest.replace(
					/^(?:\s+|;|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?(?:\*\/|$))+/,
					"",
				);
				if (!rest) break;
				const source = rest;
				const statement = await whenFree(() => db.prepare(source));
				const consumed = statement.sourceSQL.length;
				if (!consumed) break;
				const numbers = paramNumbers(statement.sourceSQL);
				const converted = values.map(sqliteValue);
				const bindings: Record<string, SQLInputValue> = {};
				for (const number of numbers)
					bindings[`$${number}`] = bindable(converted, number);
				const positional = () =>
					converted.map((_, index) => bindable(converted, index + 1));
				if (statement.columns().length) {
					rows = await whenFree(() =>
						numbers.length
							? statement.all(bindings)
							: statement.all(...positional()),
					);
					rowCount = rows.length;
				} else {
					const result = await whenFree(() =>
						numbers.length
							? statement.run(bindings)
							: statement.run(...positional()),
					);
					rows = [];
					rowCount = Number(result.changes);
				}
				rest = rest.slice(consumed);
			}
			return { rows, rowCount };
		},
		close: async () => db.close(),
	};
}
