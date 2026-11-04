import { globRegExp } from "@typesql/core/adapter";
import type { SqliteDatabase } from "../client.js";

export type RelationKind = "table" | "view";

export interface IntrospectedColumn {
	readonly name: string;
	readonly type: string;
	readonly declaredType: string;
	readonly nullable: boolean;
	readonly hasDefault: boolean;
	readonly position: number;
	readonly rowid: boolean;
	readonly generated: boolean;
	readonly hidden: boolean;
}

export interface IntrospectedRelation {
	readonly name: string;
	readonly kind: RelationKind;
	readonly strict: boolean;
	readonly withoutRowid: boolean;
	readonly columns: readonly IntrospectedColumn[];
}

export interface IntrospectedDatabase {
	readonly version: string;
	readonly relations: readonly IntrospectedRelation[];
}

export interface IntrospectOptions {
	readonly exclude?: readonly string[];
}

interface SchemaRow {
	readonly name: string;
	readonly type: RelationKind;
	readonly sql: string | null;
}

interface XInfo {
	readonly name: string;
	readonly type: string;
	readonly notnull: number | bigint;
	readonly dflt_value: string | null;
	readonly pk: number | bigint;
	readonly hidden: number | bigint;
}

const isInteger = (value: unknown): value is number | bigint =>
	typeof value === "number" || typeof value === "bigint";

const isSchemaRow = (row: unknown): row is SchemaRow =>
	typeof row === "object" &&
	row !== null &&
	"name" in row &&
	typeof row.name === "string" &&
	"type" in row &&
	(row.type === "table" || row.type === "view") &&
	"sql" in row &&
	(row.sql === null || typeof row.sql === "string");

const isXInfo = (row: unknown): row is XInfo =>
	typeof row === "object" &&
	row !== null &&
	"name" in row &&
	typeof row.name === "string" &&
	"type" in row &&
	typeof row.type === "string" &&
	"notnull" in row &&
	isInteger(row.notnull) &&
	"dflt_value" in row &&
	(row.dflt_value === null || typeof row.dflt_value === "string") &&
	"pk" in row &&
	isInteger(row.pk) &&
	"hidden" in row &&
	isInteger(row.hidden);

function parseRows<R>(rows: unknown[], isRow: (row: unknown) => row is R): R[] {
	if (rows.every(isRow)) return rows;
	throw new Error("unexpected row from a schema query");
}

export const normalizeType = (declared: string): string =>
	declared.toLowerCase().replace(/\(.*$/, "").replace(/\s+/g, " ").trim() ||
	"any";

const options = (sql: string | null): string => {
	if (!sql) return "";
	const close = sql.lastIndexOf(")");
	return close < 0 ? "" : sql.slice(close + 1).toLowerCase();
};

export function introspect(
	db: SqliteDatabase,
	opts: IntrospectOptions = {},
): IntrospectedDatabase {
	const excluded = (opts.exclude ?? []).map((glob) =>
		globRegExp(glob.toLowerCase()),
	);
	const [setting] = db.prepare("SELECT sqlite_version() AS v").all();
	if (typeof setting !== "object" || setting === null || !("v" in setting))
		throw new Error("SQLite did not report its version");
	const version = String(setting.v);
	const rows = parseRows(
		db
			.prepare(
				"SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name",
			)
			.all(),
		isSchemaRow,
	);
	const virtualTables = rows
		.filter((r) => /^\s*create\s+virtual\s+table\b/i.test(r.sql ?? ""))
		.map((r) => r.name);
	const relations: IntrospectedRelation[] = [];
	for (const row of rows) {
		if (excluded.some((re) => re.test(row.name.toLowerCase()))) continue;
		if (virtualTables.some((v) => row.name.startsWith(`${v}_`))) continue;
		const tail = options(row.sql);
		const strict = row.type === "table" && /\bstrict\b/.test(tail);
		const withoutRowid = /\bwithout\s+rowid\b/.test(tail);
		const info = parseRows(
			db
				.prepare(
					'SELECT name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid',
				)
				.all(row.name),
			isXInfo,
		);
		let visible = 0;
		const pk = info.filter((c) => Number(c.pk) > 0);
		const view = row.type === "view";
		// An INTEGER PRIMARY KEY that isn't the rowid (`INTEGER PRIMARY KEY DESC`
		// in a column definition) gets an automatic index; the rowid alias doesn't.
		const pkIndex =
			!view &&
			db
				.prepare("SELECT name FROM pragma_index_list(?) WHERE origin = 'pk'")
				.all(row.name).length > 0;
		const columns = info.map((c): IntrospectedColumn => {
			const hidden = Number(c.hidden) === 1;
			const position = hidden ? -1 : visible++;
			const isPk = Number(c.pk) > 0;
			const rowid =
				!view &&
				!withoutRowid &&
				isPk &&
				pk.length === 1 &&
				!pkIndex &&
				c.type.toLowerCase() === "integer";
			const generated = Number(c.hidden) === 2 || Number(c.hidden) === 3;
			const notNull =
				Number(c.notnull) !== 0 || rowid || (isPk && (strict || withoutRowid));
			return {
				name: c.name,
				type: normalizeType(c.type),
				declaredType: c.type,
				nullable: hidden || !notNull,
				hasDefault:
					!view && (hidden || rowid || generated || c.dflt_value !== null),
				position,
				rowid,
				generated,
				hidden,
			};
		});
		relations.push({
			name: row.name,
			kind: row.type,
			strict,
			withoutRowid,
			columns,
		});
	}
	return { version, relations };
}
