import { asRecord, type TypeValue } from "../support/evaluate.js";

export const NORM_PRELUDE = `type __B<T> = T extends "jsonb" ? "jsonb" : T extends "json" ? "json" : T;
type __C<C> = C extends { readonly type: infer T; readonly nullable: infer N; readonly hasDefault: infer D } ? { t: __B<T>; n: N; d: D } : "?";
type __Cols<R> = R extends unknown ? { [K in keyof R]: __C<R[K]> } : never;
type __Rel<R> = R extends { readonly $view: infer V } ? { view: __Cols<V> } : { table: __Cols<R> };
type __IsRel<R> = R extends { readonly $view: unknown } ? true : [keyof R] extends [never] ? false : [R[keyof R]] extends [{ readonly type: unknown }] ? true : false;
type __Ns<N> = N extends unknown ? { [T in keyof N]: __Rel<N[T]> } : never;
type NormDb<DB> = DB extends unknown ? { [K in keyof DB]: K extends "$types" ? { types: DB[K] } : K extends "$functions" ? { functions: DB[K] } : __IsRel<DB[K]> extends true ? __Rel<DB[K]> : { ns: __Ns<DB[K]> } } : never;
`;

export interface Column {
	readonly name: string;
	readonly type: string;
	readonly nullable: boolean;
	readonly hasDefault: boolean;
}

export interface Relation {
	readonly schema: string | null;
	readonly name: string;
	readonly view: boolean;
	readonly columns: readonly Column[];
}

export interface Db {
	readonly namespaces: readonly string[];
	readonly relations: readonly Relation[];
	readonly enums: { readonly [name: string]: readonly string[] };
	readonly unsupported: readonly string[];
}

const SERIAL: { readonly [t: string]: string } = {
	int2: "smallserial",
	int4: "serial",
	int8: "bigserial",
};

const SYSTEM = new Set(["pg_catalog", "information_schema"]);

export const EXTENSIONS = ["citext", "tsm_system_rows", "tsm_system_time"];

export function readDb(v: TypeValue): Db {
	const db = asRecord(v);
	if (!db) throw new Error("not a DB");
	const relations: Relation[] = [];
	const namespaces: string[] = [];
	const enums: Record<string, string[]> = {};
	const unsupported: string[] = [];
	const rel = (schema: string | null, name: string, r: TypeValue): void => {
		const rr = asRecord(r);
		const body = asRecord(rr?.table ?? rr?.view);
		if (!rr || !body)
			return void unsupported.push(`${schema ? `${schema}.` : ""}${name}`);
		const columns = Object.entries(body).map(([c, d]): Column => {
			const col = asRecord(d);
			const t = col?.t;
			return {
				name: c,
				type: typeof t === "string" ? t : "?",
				nullable: col?.n === true,
				hasDefault: col?.d === true,
			};
		});
		relations.push({ schema, name, view: rr.view !== undefined, columns });
	};
	for (const [key, value] of Object.entries(db)) {
		const r = asRecord(value);
		if (!r) continue;
		if (r.types !== undefined) {
			for (const [name, labels] of Object.entries(asRecord(r.types) ?? {}))
				enums[name] = literals(labels);
		} else if (r.functions !== undefined) {
			if (Object.keys(asRecord(r.functions) ?? {}).length)
				unsupported.push("$functions");
		} else if (r.ns !== undefined) {
			if (SYSTEM.has(key)) continue;
			if (key !== "public") namespaces.push(key);
			for (const [name, x] of Object.entries(asRecord(r.ns) ?? {}))
				rel(key === "public" ? null : key, name, x);
		} else rel(null, key, value);
	}
	return { namespaces, relations, enums, unsupported };
}

function literals(v: TypeValue): string[] {
	if (typeof v === "string") return [v];
	const r = v as { union?: readonly TypeValue[] } | null;
	return r && typeof r === "object" && "union" in r && r.union
		? r.union.filter((x): x is string => typeof x === "string")
		: [];
}

export const ident = (s: string): string => `"${s.replace(/"/g, '""')}"`;
export const literal = (s: string): string => `'${s.replace(/'/g, "''")}'`;
export const qualified = (r: {
	readonly schema: string | null;
	readonly name: string;
}): string => `${ident(r.schema ?? "public")}.${ident(r.name)}`;

export function typeSql(type: string): string {
	const m = /^(.*?)((\[\])*)$/.exec(type)!;
	const base = m[1]!;
	const dot = base.indexOf(".");
	const name =
		dot > 0
			? `${ident(base.slice(0, dot))}.${ident(base.slice(dot + 1))}`
			: ident(base);
	return `${name}${m[2]}`;
}

export function schemaDdl(
	db: Db,
): { readonly sql: string; readonly relation?: Relation }[] {
	const out: { sql: string; relation?: Relation }[] = [];
	for (const [name, labels] of Object.entries(db.enums))
		out.push({
			sql: `CREATE TYPE ${typeSql(name)} AS ENUM (${labels.map(literal).join(", ")})`,
		});
	for (const s of db.namespaces)
		out.push({ sql: `CREATE SCHEMA IF NOT EXISTS ${ident(s)}` });
	for (const r of db.relations) {
		const cols = r.columns.map((c) => {
			const serial = c.hasDefault ? SERIAL[c.type] : undefined;
			if (serial)
				return `${ident(c.name)} ${serial}${c.nullable ? "" : " NOT NULL"}`;
			const def = c.hasDefault ? defaultSql(c.type, db.enums) : "";
			return `${ident(c.name)} ${typeSql(c.type)}${c.nullable ? "" : " NOT NULL"}${def}`;
		});
		if (!r.view)
			out.push({
				sql: `CREATE TABLE ${qualified(r)} (${cols.join(", ")})`,
				relation: r,
			});
		else {
			const base = { schema: r.schema, name: `${r.name}__base` };
			out.push({
				sql: `CREATE TABLE ${qualified(base)} (${cols.join(", ")}); CREATE VIEW ${qualified(r)} AS SELECT * FROM ${qualified(base)} UNION ALL SELECT * FROM ${qualified(base)} WHERE false`,
				relation: r,
			});
		}
	}
	return out;
}

function defaultSql(type: string, enums: Db["enums"]): string {
	const s = sampleTexts(type, enums)[0];
	return s === undefined ? "" : ` DEFAULT ${literal(s)}::${typeSql(type)}`;
}

export function dbTypeText(db: Db): string {
	const col = (c: Column): string =>
		`${JSON.stringify(c.name)}: { readonly type: ${JSON.stringify(c.type)}; readonly nullable: ${c.nullable}; readonly hasDefault: ${c.hasDefault} }`;
	const rel = (r: Relation): string =>
		r.view
			? `__T.View<{ ${r.columns.map(col).join("; ")} }>`
			: `{ ${r.columns.map(col).join("; ")} }`;
	const parts = db.relations
		.filter((r) => r.schema === null)
		.map((r) => `${JSON.stringify(r.name)}: ${rel(r)}`);
	for (const ns of db.namespaces)
		parts.push(
			`${JSON.stringify(ns)}: { ${db.relations
				.filter((r) => r.schema === ns)
				.map((r) => `${JSON.stringify(r.name)}: ${rel(r)}`)
				.join("; ")} }`,
		);
	const enums = Object.entries(db.enums);
	if (enums.length)
		parts.push(
			`$types: { ${enums.map(([n, ls]) => `${JSON.stringify(n)}: ${ls.length ? ls.map((l) => JSON.stringify(l)).join(" | ") : "never"}`).join("; ")} }`,
		);
	return `{ ${parts.join("; ")} }`;
}

export function tablesOf(relations: readonly Relation[]): string[] {
	return relations.map((r) =>
		r.view
			? qualified({ schema: r.schema, name: `${r.name}__base` })
			: qualified(r),
	);
}

export function seedRows(db: Db, r: Relation): string[] {
	const table = r.view
		? qualified({ schema: r.schema, name: `${r.name}__base` })
		: qualified(r);
	if (!r.columns.length)
		return [
			`INSERT INTO ${table} DEFAULT VALUES`,
			`INSERT INTO ${table} DEFAULT VALUES`,
		];
	const samples = r.columns.map((c) => sampleTexts(c.type, db.enums));
	const width = Math.max(1, ...samples.map((s) => s.length));
	const value = (c: Column, s: readonly string[], k: number): string =>
		s.length ? `${literal(s[k % s.length]!)}::${typeSql(c.type)}` : "NULL";
	const rows: string[][] = [];
	rows.push(
		r.columns.map((c, i) => (c.nullable ? "NULL" : value(c, samples[i]!, 0))),
	);
	for (let k = 0; k < width; k++)
		rows.push(r.columns.map((c, i) => value(c, samples[i]!, k)));
	rows.push(rows[1]!);
	const names = r.columns.map((c) => ident(c.name)).join(", ");
	return rows.map(
		(vals) => `INSERT INTO ${table} (${names}) VALUES (${vals.join(", ")})`,
	);
}

const INTS: { readonly [t: string]: readonly string[] } = {
	int2: ["0", "-1", "32767"],
	int4: ["0", "-1", "2147483647"],
	int8: ["0", "-1", "9223372036854775807"],
};

const SAMPLES: { readonly [t: string]: readonly string[] } = {
	...INTS,
	numeric: ["0", "-1.5", "100000000000000000000"],
	float4: ["0", "-1.5", "Infinity", "NaN"],
	float8: ["0", "-1.5", "Infinity", "NaN"],
	money: ["0", "-1.50"],
	text: ["", "a"],
	varchar: ["", "a"],
	bpchar: ["", "a"],
	name: ["", "a"],
	citext: ["", "a"],
	char: ["a"],
	bool: ["true", "false"],
	uuid: [
		"00000000-0000-0000-0000-000000000000",
		"ffffffff-ffff-ffff-ffff-ffffffffffff",
	],
	date: ["2000-01-01", "infinity", "1999-12-31"],
	timestamp: ["2000-01-01 00:00:00", "infinity", "1999-12-31 23:59:59.999999"],
	timestamptz: [
		"2000-01-01 00:00:00+00",
		"infinity",
		"1999-12-31 23:59:59.999999+00",
	],
	time: ["00:00:00", "23:59:59"],
	timetz: ["00:00:00+00", "23:59:59+00"],
	interval: ["0", "-1 day", "1 year 2 mons"],
	json: ["{}", "[]", "null", '{"a":1,"b":[1,null]}'],
	jsonb: ["{}", "[]", "null", '{"a":1,"b":[1,null]}'],
	jsonpath: ["$", "$.a"],
	bytea: ["\\x", "\\x00ff"],
	inet: ["127.0.0.1", "::1"],
	cidr: ["10.0.0.0/8"],
	macaddr: ["08:00:2b:01:02:03"],
	macaddr8: ["08:00:2b:01:02:03:04:05"],
	bit: ["1"],
	varbit: ["", "101"],
	int4range: ["empty", "[1,2)", "(,)"],
	int8range: ["empty", "[1,2)", "(,)"],
	numrange: ["empty", "[1.5,2)", "(,)"],
	daterange: ["empty", "[2000-01-01,2000-01-02)"],
	tsrange: ["empty", "[2000-01-01,2000-01-02)"],
	tstzrange: ["empty", "[2000-01-01,2000-01-02)"],
	int4multirange: ["{}", "{[1,2)}"],
	int8multirange: ["{}", "{[1,2)}"],
	nummultirange: ["{}", "{[1,2)}"],
	datemultirange: ["{}", "{[2000-01-01,2000-01-02)}"],
	tsvector: ["", "a b"],
	tsquery: ["a"],
	point: ["(0,0)", "(1,-1)"],
	line: ["{1,-1,0}"],
	lseg: ["[(0,0),(1,1)]"],
	box: ["(1,1),(0,0)"],
	path: ["((0,0),(1,1))"],
	polygon: ["((0,0),(1,1),(1,0))"],
	circle: ["<(0,0),1>"],
	xml: ["<a/>"],
	oid: ["0", "1"],
	regclass: ["pg_class"],
	regtype: ["int4"],
	regproc: ["now"],
	xid: ["1"],
	pg_lsn: ["0/0"],
};

export function sampleTexts(
	type: string,
	enums: { readonly [name: string]: readonly string[] } = {},
): string[] {
	if (type.endsWith("[]")) {
		const elem = sampleTexts(type.slice(0, -2), enums);
		if (!elem.length) return ["{}"];
		const q = (s: string): string =>
			`"${s.replace(/["\\]/g, (c) => `\\${c}`)}"`;
		return ["{}", `{${elem.slice(0, 2).map(q).join(",")}}`];
	}
	const own =
		SAMPLES[type] ?? enums[type] ?? enums[type.slice(type.indexOf(".") + 1)];
	return own ? [...own] : [];
}
