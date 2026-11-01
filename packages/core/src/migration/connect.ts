import type { SQLInputValue } from "node:sqlite";
import { paramNumbers, sqliteValue } from "../adapter.js";
import type { Executor } from "../query.js";

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
		({ Client } = (await import("pg")).default);
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
			const result = await client.query(sql, [...values]);
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

/** One `node:sqlite` database for a migrator call. */
export async function connectSqlite(file: string): Promise<Connection> {
	const { DatabaseSync } = await import("node:sqlite");
	const db = new DatabaseSync(file);
	// Wait for another migration transaction instead of failing immediately.
	db.exec("PRAGMA busy_timeout = 30000");
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
				const statement = db.prepare(rest);
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
		},
		close: async () => db.close(),
	};
}
