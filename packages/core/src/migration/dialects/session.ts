// What a migration dialect is made of, and the helpers its history uses.

import type { SchemaDialect } from "../../codegen.js";
import type { Connection } from "../../connect.js";
import type { Dialect } from "../../dialect.js";
import type { Executor, ExecutorResult } from "../../query.js";
import { ident } from "../../runtime/compile.js";

/**
 * The history table and the migrations' transactions on the connection of
 * one migrator command.
 */
export interface Session {
	/** The history table's qualified name. */
	readonly table: string;
	/** Creates the history table if it doesn't exist. */
	readonly createTable: string;
	/** Reads the history, `name` and `at`, in the order it was applied. */
	readonly read: string;
	/** Records migration `$1` after every earlier one (applied_at increases). */
	readonly insert: string;
	/** Whether open() created the table, outside any transaction. */
	readonly created: boolean;
	/**
	 * Starts a migration's transaction, with its lock. When it rejects, it has
	 * left no transaction of its own open.
	 */
	begin(): Promise<void>;
	/** Whether this call runs in the transaction begin() started. */
	inTransaction(): Promise<boolean>;
	/**
	 * Whether rolling back now undoes all of the migration. MySQL commits
	 * implicitly before and after each DDL statement.
	 */
	whole?(): Promise<boolean>;
	/** Whether a failed inTransaction() means the transaction is there, but aborted. */
	aborted?(cause: unknown): boolean;
	/** Releases what the command held on the connection. */
	close?(): Promise<void>;
}

/**
 * The statements of a dialect that end or nest unlike the others, as the
 * migrator reads them. Its strings, names and comments are its `sql`'s
 * lexis.
 */
interface ScanRules {
	/**
	 * The objects whose CREATE statement has a `BEGIN … END` body that holds
	 * statements, which a `;` inside doesn't end.
	 */
	readonly programs: ReadonlySet<string>;
	/**
	 * Only `BEGIN ATOMIC` opens a body, and every `END` closes one or a CASE:
	 * PostgreSQL's bodies don't nest, and hold no `END IF` or the like.
	 */
	readonly atomicBodies?: boolean;
	/** `BEGIN NOT ATOMIC … END` is a block of statements that runs now (MariaDB). */
	readonly notAtomicBlocks?: boolean;
	/** `XA …` statements control a transaction (MySQL, MariaDB). */
	readonly xa?: boolean;
}

export interface MigratorDialect {
	/** The server, as messages name it. */
	readonly server: string;
	/** The `sql` a migration's `db` is. */
	readonly sql: Dialect;
	/** What the migrator connects with: a `url`, or a `db` file. */
	readonly target: "url" | "db";
	/** One connection for a migrator command. */
	connect(target: string): Promise<Connection<unknown>>;
	readonly scan: ScanRules;
	/**
	 * The statements of a `.ddl()` or `.raw()` script, sent one at a time:
	 * SQLite's prepared statements run only the first one.
	 */
	readonly split: boolean;
	/** The history on one connection; `transaction` is the config's. */
	open(
		execute: Executor,
		tableName: string,
		transaction: boolean,
	): Promise<Session>;
	/** The `Col` the generated schema module imports. */
	readonly schema: SchemaDialect;
}

/** A migration's statements reached more than one connection. */
export const SPLIT =
	"typesql: execute didn't keep a transaction across its calls, so migrations can't run in one: give it one dedicated connection, not a pool (Prisma, a pooled Kysely and libsql's client send each call to any connection), or set transaction: false";

/** A quoted name that the history table's may be part of. */
export function quoted(name: string, quote: string): string {
	if (name.includes("\0"))
		throw new Error("typesql: the migration table name must not contain NUL");
	return ident(quote, [name]);
}

/** The rows of a statement. */
export async function rows(
	execute: Executor,
	text: string,
	values: readonly unknown[] = [],
): Promise<readonly unknown[]> {
	const result: readonly unknown[] | ExecutorResult = await execute(
		text,
		values,
	);
	return "rows" in result ? result.rows : result;
}

/** The first row, when it is an object. */
export const first = (records: readonly unknown[]): object | undefined => {
	const [row] = records;
	return typeof row === "object" && row !== null ? row : undefined;
};

/** SHA-256 of `text`, with Web Crypto (Node, Bun, Deno and Workers). */
export const sha256 = (text: string): Promise<ArrayBuffer> =>
	crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));

/** Runs `statement`, ignoring a failure: what it cleans up may be gone. */
export const tryRun = (
	execute: Executor,
	statement: string,
	values: readonly unknown[] = [],
) =>
	Promise.resolve(execute(statement, values)).then(
		() => {},
		() => {},
	);
