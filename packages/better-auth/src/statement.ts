import type { CleanedWhere } from "better-auth/adapters";

/** Where the databases the adapter runs on differ. */
interface DialectFacts {
	/** UUIDs, dates, booleans and JSON are the database's own types. */
	readonly native: boolean;
	/** A row of the joined relation `j`, which has `columns`, as JSON. */
	row(columns: () => readonly string[], s: Statement): string;
	/** The JSON rows `row` as a JSON array, `[]` without rows. */
	rows(row: string): string;
	/** Whether LIKE ignores case: SQLite's does (for ASCII), and GLOB doesn't. */
	readonly likeIgnoresCase: boolean;
}

export const DIALECTS = {
	postgres: {
		native: true,
		row: () => 'to_json("j")',
		rows: (row) => `COALESCE(json_agg(${row}), '[]')`,
		likeIgnoresCase: false,
	},
	sqlite: {
		native: false,
		row: (columns, s) =>
			`json_object(${columns()
				.map((c) => `${s.param(c)}, "j".${quote(c)}`)
				.join(", ")})`,
		rows: (row) => `json_group_array(${row})`,
		likeIgnoresCase: true,
	},
} as const satisfies Readonly<Record<string, DialectFacts>>;

export type Dialect = keyof typeof DIALECTS;

export class Statement {
	readonly dialect: DialectFacts;
	readonly values: unknown[] = [];

	constructor(dialect: Dialect) {
		this.dialect = DIALECTS[dialect];
	}

	param<V>(value: V): string {
		this.values.push(value);
		return `$${this.values.length}`;
	}
}

export function quote(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

export function table(name: string): string {
	return name.split(".").map(quote).join(".");
}

export function where(
	s: Statement,
	clauses: readonly CleanedWhere[] | undefined,
): string | undefined {
	if (!clauses?.length) return undefined;
	const and: string[] = [];
	const or: string[] = [];
	for (const clause of clauses)
		(clause.connector === "OR" ? or : and).push(`(${condition(s, clause)})`);
	const parts: string[] = [];
	if (and.length > 0) parts.push(and.join(" AND "));
	if (or.length > 0) parts.push(`(${or.join(" OR ")})`);
	return parts.join(" AND ");
}

export function whereClause(
	s: Statement,
	clauses: readonly CleanedWhere[] | undefined,
): string {
	const w = where(s, clauses);
	return w === undefined ? "" : ` WHERE ${w}`;
}

function condition(s: Statement, clause: CleanedWhere): string {
	const { operator, value } = clause;
	const column = quote(clause.field);
	const insensitive =
		clause.mode === "insensitive" &&
		(typeof value === "string" ||
			(Array.isArray(value) && value.every((v) => typeof v === "string")));
	const lhs = insensitive ? `LOWER(${column})` : column;
	const rhs = <V>(v: V) =>
		s.param(insensitive && typeof v === "string" ? v.toLowerCase() : v);
	switch (operator) {
		case "eq":
			return value === null ? `${column} IS NULL` : `${lhs} = ${rhs(value)}`;
		case "ne":
			return value === null
				? `${column} IS NOT NULL`
				: `${lhs} <> ${rhs(value)}`;
		case "lt":
			return `${column} < ${s.param(value)}`;
		case "lte":
			return `${column} <= ${s.param(value)}`;
		case "gt":
			return `${column} > ${s.param(value)}`;
		case "gte":
			return `${column} >= ${s.param(value)}`;
		case "in":
		case "not_in": {
			const list: readonly unknown[] = Array.isArray(value) ? value : [value];
			const not = operator === "not_in";
			if (list.length === 0) return not ? "1 = 1" : "1 = 0";
			return `${lhs} ${not ? "NOT IN" : "IN"} (${list.map(rhs).join(", ")})`;
		}
		case "contains":
		case "starts_with":
		case "ends_with":
			return match(s, column, operator, String(value), insensitive);
		default:
			throw new Error(
				`typesql: Better Auth adapter: unknown where operator "${String(operator)}"`,
			);
	}
}

function match(
	s: Statement,
	column: string,
	operator: "contains" | "starts_with" | "ends_with",
	value: string,
	insensitive: boolean,
): string {
	const wrap = (escaped: string, any: string) =>
		operator === "starts_with"
			? `${escaped}${any}`
			: operator === "ends_with"
				? `${any}${escaped}`
				: `${any}${escaped}${any}`;
	if (s.dialect.likeIgnoresCase && !insensitive)
		return `${column} GLOB ${s.param(wrap(value.replace(/[*?[]/g, "[$&]"), "*"))}`;
	const like = insensitive && !s.dialect.likeIgnoresCase ? "ILIKE" : "LIKE";
	const pattern = wrap(value.replace(/[!%_]/g, "!$&"), "%");
	return `${column} ${like} ${s.param(pattern)} ESCAPE '!'`;
}
