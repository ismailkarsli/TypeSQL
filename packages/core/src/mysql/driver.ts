// The MySQL and MariaDB drivers' side of `sql`: `$n` rewriting, values,
// results, and the mysql2 or mariadb connection of the migrator and
// `typesql introspect`.

import { errorMessage } from "../command.js";
import {
	type Connection,
	closing,
	type Lost,
	runtimeImport,
} from "../connect.js";
import type { ExecutorResult } from "../query.js";
import {
	type PositionalStatement,
	positionalAt,
	type SplitStatement,
	splitAt,
} from "../runtime/compile.js";
import { jsonText } from "../runtime/json.js";
import { mysqlLexis } from "./dialect.js";

/** A value as MySQL drivers bind it: `sql.json(value)` becomes JSON text. */
export const mysqlValue: <V>(value: V) => V | string = jsonText;

/**
 * Rewrites TypeSQL's `$1`, `$2`, … to MySQL's positional `?`, repeating a
 * value for each use of its parameter. `map` converts each value for the
 * driver; mysqlValue by default.
 */
export function mysqlPositional<V, R>(
	text: string,
	values: readonly V[],
	map?: (value: V | undefined) => R,
): PositionalStatement {
	return positionalAt<V, unknown>(text, values, map ?? mysqlValue, mysqlLexis);
}

/** MySQL text split at its `$n` parameters, each value mapped by `map`. */
export const mysqlSplit = <V, R>(
	text: string,
	values: readonly V[],
	map: (value: V | undefined) => R,
): SplitStatement => splitAt(text, values, map, mysqlLexis);

/** A value as mysql2 and the mariadb connector bind it. */
export type MySqlValue =
	| string
	| number
	| bigint
	| boolean
	| Date
	| Buffer
	| null;

/**
 * A value as mysql2 and the mariadb connector bind it: `sql.json(…)` is JSON
 * text, `undefined` is `NULL`, and a plain `Uint8Array` becomes a `Buffer`,
 * which both drivers send as binary. Any other object is refused: the
 * drivers would write it into the statement as SQL text.
 */
export function mysqlBind<V>(value: V): MySqlValue {
	const v = mysqlValue(value);
	if (v === undefined || v === null) return null;
	if (Buffer.isBuffer(v) || v instanceof Date) return v;
	if (v instanceof Uint8Array)
		return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
	switch (typeof v) {
		case "string":
		case "number":
		case "bigint":
		case "boolean":
			return v;
	}
	throw new TypeError(
		`typesql: cannot bind ${Object.prototype.toString.call(v)} as a MySQL value; use sql.json() for JSON`,
	);
}

/**
 * What mysql2 and the mariadb connector resolve a statement to: its rows,
 * the OK packet of a statement without rows, or, for a script of several
 * statements, a list of those.
 */
export type MySqlResult =
	| readonly unknown[]
	| { readonly affectedRows?: number | bigint };

const isPacket = (item: unknown): item is { affectedRows?: number | bigint } =>
	typeof item === "object" &&
	item !== null &&
	"affectedRows" in item &&
	"insertId" in item;

/** Whether an element of a result list is a statement's result, not a row. */
const isStatementResult = (item: unknown): item is MySqlResult =>
	Array.isArray(item) || isPacket(item);

/**
 * A MySQL driver's result as an executor's: the rows of a statement that
 * returns them, else its affected row count. A script's last statement
 * stands for it.
 */
export function mysqlResult(result: MySqlResult): ExecutorResult {
	if (Array.isArray(result)) {
		const last = result.at(-1);
		return last !== undefined && result.every(isStatementResult)
			? mysqlResult(last)
			: { rows: result, rowCount: result.length };
	}
	const affected = "affectedRows" in result ? result.affectedRows : undefined;
	return { rows: [], rowCount: affected === undefined ? 0 : Number(affected) };
}

/** A mysql2 or mariadb connection, as the connection hands it out. */
export interface MySqlClient {
	query(sql: string, values?: unknown[]): Promise<readonly unknown[]>;
	end(): Promise<void>;
}

/** A MySQL session: a mysql2 or mariadb connection. */
interface Session extends MySqlClient {
	on(event: "error", listener: (error: Error) => void): void;
}

type Mysql2 = typeof import("mysql2/promise");

/**
 * What connectMysql reads of the `mariadb` connector. A statement resolves
 * to its rows, or to the OK packet of one without rows, which mysqlResult
 * reads.
 */
interface MariaDb {
	createConnection(uri: string): Promise<Session>;
}

const isMysql2 = (module: unknown): module is { readonly default: Mysql2 } =>
	typeof module === "object" &&
	module !== null &&
	"default" in module &&
	typeof module.default === "object" &&
	module.default !== null &&
	"createConnection" in module.default &&
	typeof module.default.createConnection === "function";

const isMariaDb = (module: unknown): module is MariaDb =>
	typeof module === "object" &&
	module !== null &&
	"createConnection" in module &&
	typeof module.createConnection === "function";

/** A session, and how a statement runs on it. */
interface Opened {
	readonly session: Session;
	run(text: string, values: unknown[]): Promise<MySqlResult>;
}

/**
 * A session with mysql2, else with the mariadb connector. Multiple
 * statements let .raw() run a script, as it does on PostgreSQL.
 */
async function openMysql(url: string): Promise<Opened> {
	const rest = url.slice(url.indexOf(":"));
	const mysql2 = await runtimeImport("mysql2/promise", isMysql2).catch(
		() => undefined,
	);
	if (mysql2) {
		const connection = await mysql2.default.createConnection({
			uri: `mysql${rest}`,
			multipleStatements: true,
		});
		return {
			session: {
				query: (text, values) => connection.query(text, values),
				end: () => connection.end(),
				on: (event, listener) => {
					connection.on(event, listener);
				},
			},
			run: async (text, values) => (await connection.query(text, values))[0],
		};
	}
	let mariadb: MariaDb;
	try {
		mariadb = await runtimeImport("mariadb", isMariaDb);
	} catch (cause) {
		throw new Error(
			'typesql: url connects with the "mysql2" package, or the "mariadb" connector, and neither is installed: npm install mysql2',
			{ cause },
		);
	}
	const uri = new URL(`mariadb${rest}`);
	uri.searchParams.set("multipleStatements", "true");
	const session = await mariadb.createConnection(uri.href);
	return { session, run: (text, values) => session.query(text, values) };
}

/** One mysql2 (or mariadb) connection for a MySQL or MariaDB URL. */
export async function connectMysql(
	url: string,
): Promise<Connection<MySqlClient>> {
	if (!URL.canParse(url) || !/^(mysql|mariadb):$/.test(new URL(url).protocol))
		throw new Error(
			`typesql: invalid connection URL ${JSON.stringify(url)} (expected mysql://user:password@host:port/database)`,
		);
	let opened: Opened;
	try {
		opened = await openMysql(url);
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("typesql:"))
			throw error;
		throw new Error(
			`typesql: cannot connect to MySQL: ${errorMessage(error)}`,
			{
				cause: error,
			},
		);
	}
	// The server can end the session between queries. Without a listener,
	// the driver's 'error' event would end the process; the next query
	// rejects with the error instead.
	const { session, run } = opened;
	const lost: Lost = { error: undefined };
	session.on("error", (error: Error) => {
		lost.error ??= error;
	});
	return {
		client: session,
		execute: async (sql, values) => {
			if (lost.error) throw lost.error;
			const positional = mysqlPositional(sql, values, mysqlBind);
			return mysqlResult(await run(positional.text, positional.values));
		},
		close: () => closing(session.end(), lost),
	};
}

const ESCAPES: ReadonlyMap<string, string> = new Map([
	["\0", "\\0"],
	["\b", "\\b"],
	["\t", "\\t"],
	["\n", "\\n"],
	["\r", "\\r"],
	["\x1a", "\\Z"],
	["\\", "\\\\"],
	// Doubled, not `\\'`: with NO_BACKSLASH_ESCAPES that would end the string.
	["'", "''"],
]);

function quote(s: string): string {
	let out = "'";
	for (const c of s) out += ESCAPES.get(c) ?? c;
	return `${out}'`;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** A value as a MySQL literal. Dates are written in UTC, the serverless platforms' time zone. */
function literal<V>(value: V): string {
	const v = mysqlValue(value);
	if (v === null || v === undefined) return "NULL";
	switch (typeof v) {
		case "string":
			return quote(v);
		case "boolean":
			return v ? "TRUE" : "FALSE";
		case "bigint":
			return v < 0n ? `(${v})` : String(v);
		case "number":
			if (!Number.isFinite(v))
				throw new TypeError(`typesql: MySQL has no ${v} value`);
			// `5-$1` must not become the comment-free but odd `5--1`.
			return v < 0 ? `(${v})` : String(v);
	}
	if (v instanceof Date) {
		if (Number.isNaN(v.getTime()))
			throw new TypeError("typesql: cannot bind an invalid Date");
		return `'${pad(v.getUTCFullYear(), 4)}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}.${pad(v.getUTCMilliseconds(), 3)}'`;
	}
	if (v instanceof Uint8Array) {
		let hex = "";
		for (const b of v) hex += b.toString(16).padStart(2, "0");
		return `X'${hex}'`;
	}
	throw new TypeError(
		`typesql: cannot bind ${Object.prototype.toString.call(v)} as a MySQL value; use sql.json() for JSON`,
	);
}

/**
 * The HTTP drivers bind nothing on the server, so `$1`, `$2`, … become
 * escaped literals in the statement text.
 */
export function mysqlInline(text: string, values: readonly unknown[]): string {
	if (!text.includes("$")) return text;
	const { parts, values: literals } = mysqlSplit(text, values, literal);
	return parts.reduce(
		(out, part, i) => `${out}${String(literals[i - 1])}${part}`,
	);
}
