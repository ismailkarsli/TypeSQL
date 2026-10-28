import { ident, literal, typeSql } from "../oracle/schema.js";

export type SqlType =
	| "int4"
	| "int8"
	| "numeric"
	| "float8"
	| "text"
	| "bool"
	| "timestamptz"
	| "date"
	| "jsonb"
	| "mood"
	| "int4[]";

export interface FuzzColumn {
	readonly name: string;
	readonly type: SqlType;
	readonly nullable: boolean;
}

export interface FuzzTable {
	readonly name: string;
	readonly columns: readonly FuzzColumn[];
	readonly rows: readonly (readonly string[])[];
}

export const MOOD = ["happy", "sad", "meh"] as const;

const col = (name: string, type: SqlType, nullable = true): FuzzColumn => ({
	name,
	type,
	nullable,
});

const VALUES: { readonly [T in SqlType]: readonly string[] } = {
	int4: ["0", "1", "-1", "2", "2147483647", "3"],
	int8: ["0", "10", "-5", "9223372036854775807"],
	numeric: ["0", "1.5", "-2.25", "100000000000000000000"],
	float8: ["0", "1.5", "-1", "'Infinity'"],
	text: ["''", "'a'", "'b'", "'abc'"],
	bool: ["true", "false"],
	timestamptz: [
		"'2000-01-01 00:00:00+00'",
		"'infinity'",
		"'2020-02-29 12:00:00+00'",
	],
	date: ["'2000-01-01'", "'2020-02-29'", "'-infinity'"],
	jsonb: [
		`'{}'`,
		`'{"a":1,"b":[1,null]}'`,
		`'null'`,
		`'[1,2]'`,
		`'{"a":null}'`,
	],
	mood: ["'happy'", "'sad'", "'meh'"],
	"int4[]": ["'{}'", "'{1,2}'", "'{3}'"],
};

const SPECS: readonly {
	name: string;
	columns: FuzzColumn[];
	count: number;
	ids?: readonly string[];
}[] = [
	{
		name: "t1",
		count: 8,
		columns: [
			col("id", "int4", false),
			col("a", "int4"),
			col("b", "text", false),
			col("c", "text"),
			col("d", "numeric"),
			col("e", "bool"),
			col("f", "timestamptz"),
			col("g", "jsonb"),
			col("h", "mood"),
			col("i", "int4[]"),
			col("j", "int8", false),
		],
	},
	{
		name: "t2",
		count: 8,
		columns: [
			col("id", "int4", false),
			col("t1_id", "int4"),
			col("a", "int4"),
			col("b", "text"),
			col("x", "int8"),
			col("y", "bool", false),
			col("z", "float8"),
		],
	},
	{
		name: "t3",
		count: 6,
		columns: [
			col("id", "int4", false),
			col("a", "int4", false),
			col("c", "text"),
			col("h", "mood", false),
			col("w", "date"),
		],
	},
	{
		name: "t4",
		count: 0,
		columns: [col("id", "int4", false), col("a", "int4"), col("b", "text")],
	},
	{
		name: "t5",
		count: 5,
		columns: [col("k", "text", false), col("v", "int4"), col("a", "int4")],
	},
];

function rows(spec: (typeof SPECS)[number]): string[][] {
	const out: string[][] = [];
	for (let r = 0; r < spec.count; r++) {
		out.push(
			spec.columns.map((c, ci) => {
				if (c.name === "id") return String(r);
				// t2 rows point at t1 rows, some at none (99) or NULL: outer joins have rows without partners
				if (c.name === "t1_id")
					return ["0", "1", "1", "99", "NULL", "2", "5", "0"][r]!;
				if (c.nullable && (r + ci) % 3 === 0) return "NULL";
				const vs = VALUES[c.type];
				return vs[(r + ci) % vs.length]!;
			}),
		);
	}
	if (spec.count > 2)
		out[spec.count - 1] = out[spec.count - 2]!.map((v, i) =>
			spec.columns[i]!.name === "id" ? String(spec.count - 1) : v,
		);
	return out;
}

export const TABLES: readonly FuzzTable[] = SPECS.map((s) => ({
	name: s.name,
	columns: s.columns,
	rows: rows(s),
}));

export function fuzzSetup(): string[] {
	const out = [`CREATE TYPE mood AS ENUM (${MOOD.map(literal).join(", ")})`];
	for (const t of TABLES) {
		const cols = t.columns.map(
			(c) =>
				`${ident(c.name)} ${typeSql(c.type)}${c.nullable ? "" : " NOT NULL"}${c.name === "id" ? " PRIMARY KEY" : ""}`,
		);
		out.push(`CREATE TABLE ${ident(t.name)} (${cols.join(", ")})`);
	}
	// t2.t1_id = 99 has no partner: the foreign key is NOT VALID and added after the rows
	for (const t of TABLES)
		for (const r of t.rows)
			out.push(
				`INSERT INTO ${ident(t.name)} VALUES (${r.map((v, i) => (v === "NULL" ? v : `${v}::${typeSql(t.columns[i]!.type)}`)).join(", ")})`,
			);
	out.push(
		`ALTER TABLE t2 ADD FOREIGN KEY (t1_id) REFERENCES t1 (id) NOT VALID`,
	);
	return out;
}

export function fuzzDbType(): string {
	const rels = TABLES.map(
		(t) =>
			`${t.name}: { ${t.columns.map((c) => `${c.name}: __T.${c.nullable ? "Nullable" : "Col"}<${JSON.stringify(c.type)}>`).join("; ")} }`,
	);
	return `{ ${rels.join("; ")}; $types: { mood: ${MOOD.map((m) => JSON.stringify(m)).join(" | ")} } }`;
}
