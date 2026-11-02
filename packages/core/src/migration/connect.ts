import type { SQLInputValue } from "node:sqlite";
import { paramNumbers, sqliteValue } from "../adapter.js";
import type { Executor } from "../query.js";
import { runtimeImport } from "./node.js";

interface Connection {
	readonly execute: Executor;
	close(): Promise<void>;
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

/** One `pg` client for a migrator call. */
export async function connectPostgres(url: string): Promise<Connection> {
	if (!URL.canParse(url) && !url.startsWith("/"))
		throw new Error(
			`typesql: invalid connection URL ${JSON.stringify(url)} (expected postgres://user:password@host:port/database)`,
		);
	let Client: typeof import("pg").Client;
	try {
		({ Client } = ((await runtimeImport("pg")) as typeof import("pg")).default);
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
				.catch((error: unknown) => {
					// A session ended during a query rejects it with the server's
					// FATAL error; later queries get pg's own "connection
					// terminated" errors, so the server's message is the one to keep.
					const { severity } = error as { severity?: unknown };
					if (severity === "FATAL" || severity === "PANIC")
						lost ??= error as Error;
					throw error;
				});
			return Array.isArray(result)
				? (result.at(-1) ?? { rows: [], rowCount: 0 })
				: result;
		},
		close: async () => {
			await client.end().catch((error: unknown) => {
				if (!lost) throw error;
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
			const { errcode } = error as { errcode?: unknown };
			// SQLITE_BUSY and its extended codes.
			const busy = typeof errcode === "number" && (errcode & 0xff) === 5;
			if (!busy || Date.now() - start >= BUSY_LIMIT) throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}

/** One `node:sqlite` database for a migrator call. */
export async function connectSqlite(file: string): Promise<Connection> {
	const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
	const db = new DatabaseSync(file);
	return {
		execute: async (sql, values) => {
			let rest = sql;
			let rows: Record<string, unknown>[] = [];
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
				const bindings: Record<string, SQLInputValue> = {};
				for (const number of numbers)
					bindings[`$${number}`] = sqliteValue(
						values[number - 1],
					) as SQLInputValue;
				const positional = values.map(sqliteValue) as SQLInputValue[];
				if (statement.columns().length) {
					rows = await whenFree(() =>
						numbers.length
							? statement.all(bindings)
							: statement.all(...positional),
					);
					rowCount = rows.length;
				} else {
					const result = await whenFree(() =>
						numbers.length
							? statement.run(bindings)
							: statement.run(...positional),
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
