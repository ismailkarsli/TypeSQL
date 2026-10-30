export interface PgField {
	readonly name: string;
	readonly dataTypeID: number;
}

export type PgLookup = (
	text: string,
	values: unknown[],
) => Promise<{ readonly rows: readonly unknown[] }>;

type Parse = (text: string) => unknown;

// Types created by users and extensions (enums, domains, citext) have OIDs
// from here on. node-postgres has no parsers for their array types.
const FIRST_USER_OID = 16384;

const ELEMENTS: { readonly [oid: number]: Parse } = {
	16: (s) => s === "t",
	21: Number,
	23: Number,
	26: Number,
	700: Number,
	701: Number,
};

const LOOKUP = `WITH RECURSIVE t(arr, oid, base) AS (
	SELECT a.oid, e.oid, e.typbasetype
	FROM pg_catalog.pg_type a JOIN pg_catalog.pg_type e ON e.oid = a.typelem
	WHERE a.oid = ANY($1::oid[]) AND a.typcategory = 'A'
	UNION ALL
	SELECT t.arr, b.oid, b.typbasetype FROM t JOIN pg_catalog.pg_type b ON b.oid = t.base
)
SELECT arr::text AS arr, oid::text AS elem FROM t WHERE base = 0`;

const caches = new WeakMap<object, Map<number, Promise<Parse | null>>>();

/**
 * node-postgres returns arrays of enums, domains and extension types such as
 * citext as array literals (`"{a,b}"`). Parse them, looking up once per `owner`
 * which user-defined types are arrays and what their element's base type is.
 */
export async function parsePgUserArrays(
	owner: object,
	lookup: PgLookup,
	fields: readonly PgField[] | undefined,
	rows: unknown[],
): Promise<unknown[]> {
	const user = fields?.filter((f) => f.dataTypeID >= FIRST_USER_OID) ?? [];
	if (user.length === 0 || rows.length === 0) return rows;
	const cache = caches.get(owner) ?? new Map<number, Promise<Parse | null>>();
	caches.set(owner, cache);
	const missing = [...new Set(user.map((f) => f.dataTypeID))].filter(
		(oid) => !cache.has(oid),
	);
	if (missing.length > 0) {
		const found = lookupArrays(lookup, missing).catch(() => {
			for (const oid of missing) cache.delete(oid);
			return new Map<number, Parse>();
		});
		for (const oid of missing)
			cache.set(
				oid,
				found.then((m) => m.get(oid) ?? null),
			);
	}
	const parsers = (
		await Promise.all(
			user.map(async (f) => [f.name, await cache.get(f.dataTypeID)] as const),
		)
	).filter((p): p is readonly [string, Parse] => p[1] !== null);
	if (parsers.length === 0) return rows;
	for (const row of rows as Record<string, unknown>[])
		for (const [name, parse] of parsers) {
			const value = row[name];
			if (typeof value === "string") row[name] = parse(value);
		}
	return rows;
}

async function lookupArrays(
	lookup: PgLookup,
	oids: readonly number[],
): Promise<Map<number, Parse>> {
	const { rows } = await lookup(LOOKUP, [oids.map(String)]);
	const parsers = new Map<number, Parse>();
	for (const row of rows as { arr: string; elem: string }[]) {
		const element = ELEMENTS[Number(row.elem)] ?? String;
		parsers.set(Number(row.arr), (text) => parsePgArray(text, element));
	}
	return parsers;
}

/** Parses PostgreSQL's text form of an array, including nested arrays and NULLs. */
export function parsePgArray(text: string, element: Parse): unknown {
	let i = text.startsWith("[") ? text.indexOf("=") + 1 : 0;
	if (text[i] !== "{") return text;
	const list = (): unknown[] => {
		const out: unknown[] = [];
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
