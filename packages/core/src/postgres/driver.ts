// The PostgreSQL drivers' side of `sql`: node-postgres results and arrays,
// and the `pg` connection of the migrator and `typesql introspect`.

import { errorMessage } from "../command.js";
import {
	type Connection,
	closing,
	type Lost,
	runtimeImport,
} from "../connect.js";

/**
 * node-postgres resolves a script of several statements, which it runs
 * when a call has no parameters, to the list of their results: the last
 * one stands for the script. A script without statements has none.
 */
export function pgResult<R extends object>(
	result: R | readonly R[],
): R | undefined {
	return isList(result) ? result.at(-1) : result;
}

const isList = <R>(result: R | readonly R[]): result is readonly R[] =>
	Array.isArray(result);

export interface PgField {
	readonly name: string;
	readonly dataTypeID: number;
}

export type PgLookup = (
	text: string,
	values: unknown[],
) => Promise<{ readonly rows: readonly unknown[] }>;

type PgArray<E> = (E | null | PgArray<E>)[];

type PgElement = string | number | boolean;

type ParseElement = (text: string) => PgElement;

type ParseArray = (text: string) => string | PgArray<PgElement>;

interface LookupRow {
	readonly arr: string;
	readonly elem: string;
}

// Types created by users and extensions (enums, domains, citext) have OIDs
// from here on. node-postgres has no parsers for their array types.
const FIRST_USER_OID = 16384;

const ELEMENTS = new Map<number, ParseElement>([
	[16, (s) => s === "t"],
	[21, Number],
	[23, Number],
	[26, Number],
	[700, Number],
	[701, Number],
]);

const LOOKUP = `WITH RECURSIVE t(arr, oid, base) AS (
	SELECT a.oid, e.oid, e.typbasetype
	FROM pg_catalog.pg_type a JOIN pg_catalog.pg_type e ON e.oid = a.typelem
	WHERE a.oid = ANY($1::oid[]) AND a.typcategory = 'A'
	UNION ALL
	SELECT t.arr, b.oid, b.typbasetype FROM t JOIN pg_catalog.pg_type b ON b.oid = t.base
)
SELECT arr::text AS arr, oid::text AS elem FROM t WHERE base = 0`;

const caches = new WeakMap<WeakKey, Map<number, Promise<ParseArray | null>>>();

/**
 * node-postgres returns arrays of enums, domains and extension types such as
 * citext as array literals (`"{a,b}"`). Parse them, looking up once per `owner`
 * which user-defined types are arrays and what their element's base type is.
 */
export async function parsePgUserArrays(
	owner: WeakKey,
	lookup: PgLookup,
	fields: readonly PgField[] | undefined,
	rows: unknown[],
): Promise<unknown[]> {
	// Row objects keep the last column with each name, including its type.
	const lastFields = new Map(fields?.map((f) => [f.name, f]));
	const user = [...lastFields.values()].filter(
		(f) => f.dataTypeID >= FIRST_USER_OID,
	);
	if (user.length === 0 || rows.length === 0) return rows;
	const cache =
		caches.get(owner) ?? new Map<number, Promise<ParseArray | null>>();
	caches.set(owner, cache);
	const missing = new Set<number>();
	for (const { dataTypeID } of user)
		if (!cache.has(dataTypeID)) missing.add(dataTypeID);
	if (missing.size > 0) {
		const found = lookupArrays(lookup, Array.from(missing)).catch(() => {
			for (const oid of missing) cache.delete(oid);
			return new Map<number, ParseArray>();
		});
		for (const oid of missing)
			cache.set(
				oid,
				found.then((m) => m.get(oid) ?? null),
			);
	}
	const parsers = new Map(
		(
			await Promise.all(
				user.map(async (f) => [f.name, await cache.get(f.dataTypeID)] as const),
			)
		).filter((p): p is readonly [string, ParseArray] => p[1] !== null),
	);
	if (parsers.size === 0) return rows;
	for (const row of rows) {
		// node-postgres rows are objects with an own property per column.
		if (typeof row !== "object" || row === null) continue;
		for (const [name, value] of Object.entries(row)) {
			const parse = parsers.get(name);
			if (parse && typeof value === "string")
				Object.assign(row, { [name]: parse(value) });
		}
	}
	return rows;
}

async function lookupArrays(
	lookup: PgLookup,
	oids: readonly number[],
): Promise<Map<number, ParseArray>> {
	const { rows } = await lookup(LOOKUP, [oids.map(String)]);
	const parsers = new Map<number, ParseArray>();
	for (const row of rows) {
		if (!isLookupRow(row)) continue;
		const element = ELEMENTS.get(Number(row.elem)) ?? String;
		parsers.set(Number(row.arr), (text) => parsePgArray(text, element));
	}
	return parsers;
}

function isLookupRow(row: unknown): row is LookupRow {
	return (
		typeof row === "object" &&
		row !== null &&
		"arr" in row &&
		typeof row.arr === "string" &&
		"elem" in row &&
		typeof row.elem === "string"
	);
}

/** Parses PostgreSQL's text form of an array, including nested arrays and NULLs. */
export function parsePgArray<E>(
	text: string,
	element: (text: string) => E,
): string | PgArray<E> {
	let i = text.startsWith("[") ? text.indexOf("=") + 1 : 0;
	if (text[i] !== "{") return text;
	const list = (): PgArray<E> => {
		const out: PgArray<E> = [];
		i++;
		if (text[i] === "}") {
			i++;
			return out;
		}
		while (i < text.length) {
			if (text[i] === "{") out.push(list());
			else if (text[i] === '"') {
				let s = "";
				i++;
				while (i < text.length && text[i] !== '"') {
					if (text[i] === "\\") i++;
					s += text[i++];
				}
				i++;
				out.push(element(s));
			} else {
				const start = i;
				while (i < text.length && text[i] !== "," && text[i] !== "}") i++;
				const s = text.slice(start, i);
				out.push(s === "NULL" ? null : element(s));
			}
			if (text[i++] !== ",") break;
		}
		return out;
	};
	return list();
}

/** A `pg` Client, as the connection hands it out. */
export interface PgClient {
	query(
		text: string,
		values?: unknown[],
	): Promise<{
		readonly rows: unknown[];
		readonly rowCount: number | null;
		readonly fields?: readonly PgField[];
	}>;
	end(): Promise<void>;
}

type Pg = typeof import("pg");

const isPg = (module: unknown): module is Pg =>
	typeof module === "object" &&
	module !== null &&
	"default" in module &&
	typeof module.default === "object" &&
	module.default !== null &&
	"Client" in module.default &&
	typeof module.default.Client === "function";

/** One `pg` client for a PostgreSQL URL. */
export async function connectPostgres(
	url: string,
): Promise<Connection<PgClient>> {
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
	const lost: Lost = { error: undefined };
	client.on("error", (error) => {
		lost.error ??= error;
	});
	try {
		await client.connect();
	} catch (error) {
		throw new Error(
			`typesql: cannot connect to PostgreSQL: ${errorMessage(error)}`,
			{ cause: error },
		);
	}
	return {
		client,
		execute: async (sql, values) => {
			if (lost.error) throw lost.error;
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
						lost.error ??= cause;
					throw cause;
				});
			return pgResult(result) ?? { rows: [], rowCount: 0 };
		},
		close: () => closing(client.end(), lost),
	};
}
