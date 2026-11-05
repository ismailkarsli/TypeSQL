import { globRegExp } from "@typesql/core/adapter";

/**
 * A mysql2 or mariadb Pool, PoolConnection or Connection: a query resolves
 * to its rows (the mariadb connector) or to `[rows, fields]` (mysql2).
 */
export interface MySqlQueryable {
	query(sql: string, values?: unknown[]): Promise<readonly unknown[]>;
}

export type RelationKind = "table" | "view";

export interface IntrospectedColumn {
	readonly name: string;
	/** The canonical type name: `"int unsigned"`, `"varchar"`, `"enum"`, `"json"`. */
	readonly type: string;
	/** `COLUMN_TYPE` as the server reports it: `"int unsigned"`, `"enum('a','b')"`. */
	readonly declaredType: string;
	/** The values of an `ENUM` column. */
	readonly enumValues: readonly string[] | null;
	readonly nullable: boolean;
	/** Can be left out of an `INSERT`: a `DEFAULT`, `AUTO_INCREMENT` or generated column. */
	readonly hasDefault: boolean;
	readonly default: string | null;
	/** 0-based, counting invisible columns. */
	readonly position: number;
	readonly autoIncrement: boolean;
	readonly generated: {
		readonly expression: string;
		readonly stored: boolean;
	} | null;
	/** An `INVISIBLE` column: left out of `SELECT *`. */
	readonly hidden: boolean;
	readonly comment: string | null;
}

export interface IntrospectedRelation {
	readonly name: string;
	readonly kind: RelationKind;
	readonly comment: string | null;
	readonly columns: readonly IntrospectedColumn[];
}

export interface IntrospectedDatabase {
	/** `VERSION()`: `"8.4.3"`, `"11.8.2-MariaDB-ubu2404"`. */
	readonly version: string;
	readonly mariadb: boolean;
	readonly database: string;
	readonly relations: readonly IntrospectedRelation[];
}

export interface IntrospectOptions {
	/** The database (schema) to read; default: the connection's current database. */
	readonly database?: string;
	/** Relations to leave out, `*` matching any characters. */
	readonly exclude?: readonly string[];
}

const INTEGERS = new Set(["tinyint", "smallint", "mediumint", "int", "bigint"]);

/** `DATA_TYPE` and `COLUMN_TYPE` to a TypeSQL type name: lowercase, no length, ` unsigned` on integers. */
export function normalizeType(dataType: string, columnType: string): string {
	const t = dataType.toLowerCase();
	return INTEGERS.has(t) && /\bunsigned\b/i.test(columnType)
		? `${t} unsigned`
		: t;
}

/** The values of `enum('a','b''c')`. */
export function enumValues(columnType: string): string[] {
	const body = /^enum\s*\(([\s\S]*)\)$/i.exec(columnType.trim())?.[1] ?? "";
	return [...body.matchAll(/'((?:[^'\\]|''|\\[\s\S])*)'/g)].map(([, v = ""]) =>
		v.replace(/''|\\([\s\S])/g, (_s, c?: string) => {
			if (c === undefined) return "'";
			return c === "0" ? "\0" : c === "n" ? "\n" : c === "t" ? "\t" : c;
		}),
	);
}

const JSON_VALID = /^\s*json_valid\s*\(\s*`((?:[^`]|``)+)`\s*\)\s*$/i;

// Rows of the information_schema queries below, as the drivers return them.

interface VersionRow {
	readonly version: string;
	readonly current: string | null;
}

interface TableRow {
	readonly name: string;
	readonly type: string;
	readonly comment: string | null;
}

interface ColumnRow {
	readonly tbl: string;
	readonly name: string;
	readonly pos: number | bigint;
	readonly dflt: string | null;
	readonly nullable: string;
	readonly dataType: string;
	readonly columnType: string;
	readonly extra: string | null;
	readonly genExpr: string | null;
	readonly comment: string | null;
}

interface CheckRow {
	readonly tbl: string;
	readonly clause: string;
}

const isObject = (row: unknown): row is object =>
	typeof row === "object" && row !== null;

const isText = (value: unknown): value is string | null =>
	typeof value === "string" || value === null;

const isVersionRow = (row: unknown): row is VersionRow =>
	isObject(row) &&
	"version" in row &&
	typeof row.version === "string" &&
	"current" in row &&
	isText(row.current);

const isTableRow = (row: unknown): row is TableRow =>
	isObject(row) &&
	"name" in row &&
	typeof row.name === "string" &&
	"type" in row &&
	typeof row.type === "string" &&
	"comment" in row &&
	isText(row.comment);

const isColumnRow = (row: unknown): row is ColumnRow =>
	isObject(row) &&
	"tbl" in row &&
	typeof row.tbl === "string" &&
	"name" in row &&
	typeof row.name === "string" &&
	"pos" in row &&
	(typeof row.pos === "number" || typeof row.pos === "bigint") &&
	"dflt" in row &&
	isText(row.dflt) &&
	"nullable" in row &&
	typeof row.nullable === "string" &&
	"dataType" in row &&
	typeof row.dataType === "string" &&
	"columnType" in row &&
	typeof row.columnType === "string" &&
	"extra" in row &&
	isText(row.extra) &&
	"genExpr" in row &&
	isText(row.genExpr) &&
	"comment" in row &&
	isText(row.comment);

const isCheckRow = (row: unknown): row is CheckRow =>
	isObject(row) &&
	"tbl" in row &&
	typeof row.tbl === "string" &&
	"clause" in row &&
	typeof row.clause === "string";

export async function introspect(
	client: MySqlQueryable,
	options: IntrospectOptions = {},
): Promise<IntrospectedDatabase> {
	const q = async <R>(
		isRow: (row: unknown) => row is R,
		text: string,
		values?: unknown[],
	): Promise<readonly R[]> => {
		const result = await client.query(text, values);
		// mysql2 resolves to [rows, fields], the mariadb connector to the rows.
		const [first] = result;
		const rows: readonly unknown[] = Array.isArray(first) ? first : result;
		if (rows.every(isRow)) return rows;
		throw new Error("unexpected row from an information_schema query");
	};
	const [server] = await q(
		isVersionRow,
		"SELECT VERSION() AS version, DATABASE() AS current",
	);
	if (!server) throw new Error("the server did not report its version");
	const { version, current } = server;
	const mariadb = /mariadb/i.test(version);
	const database = options.database ?? current;
	if (!database)
		throw new Error(
			"no database selected: name one in the connection URL or pass --database",
		);
	const [exists] = await q(
		isObject,
		"SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
		[database],
	);
	if (!exists)
		throw new Error(`database ${JSON.stringify(database)} does not exist`);

	const excluded = options.exclude?.map(globRegExp);
	const tables = (
		await q(
			isTableRow,
			`SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_COMMENT AS comment
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE IN ('BASE TABLE', 'SYSTEM VERSIONED', 'VIEW')
        ORDER BY TABLE_NAME`,
			[database],
		)
	).filter((t) => !excluded?.some((re) => re.test(t.name)));
	const columns = await q(
		isColumnRow,
		`SELECT TABLE_NAME AS tbl, COLUMN_NAME AS name, ORDINAL_POSITION AS pos,
            COLUMN_DEFAULT AS dflt, IS_NULLABLE AS nullable, DATA_TYPE AS dataType,
            COLUMN_TYPE AS columnType, EXTRA AS extra,
            GENERATION_EXPRESSION AS genExpr, COLUMN_COMMENT AS comment
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
		[database],
	);
	// MariaDB's JSON is LONGTEXT with a `CHECK (json_valid(col))`.
	const jsonColumns = new Set<string>();
	if (mariadb) {
		const checks = await q(
			isCheckRow,
			`SELECT TABLE_NAME AS tbl, CHECK_CLAUSE AS clause
         FROM information_schema.CHECK_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ?`,
			[database],
		);
		for (const c of checks) {
			const col = JSON_VALID.exec(c.clause)?.[1];
			if (col) jsonColumns.add(`${c.tbl}.${col.replace(/``/g, "`")}`);
		}
	}
	const byTable = new Map<string, ColumnRow[]>();
	for (const c of columns)
		byTable.set(c.tbl, [...(byTable.get(c.tbl) ?? []), c]);

	const relations = tables.map((t): IntrospectedRelation => {
		const view = t.type === "VIEW";
		return {
			name: t.name,
			kind: view ? "view" : "table",
			comment: view || !t.comment ? null : t.comment,
			columns: (byTable.get(t.name) ?? []).map((c) => column(c, view)),
		};
	});
	return { version, mariadb, database, relations };

	function column(c: ColumnRow, view: boolean): IntrospectedColumn {
		const extra = c.extra ?? "";
		const autoIncrement = /\bauto_increment\b/i.test(extra);
		const gen = /\b(virtual|stored|persistent)\s+generated\b/i.exec(extra);
		const generated = gen
			? {
					expression: c.genExpr ?? "",
					stored: gen[1]?.toLowerCase() !== "virtual",
				}
			: null;
		// MariaDB reports a nullable column's implicit default as the text NULL.
		const dflt =
			generated || (mariadb && c.dflt === "NULL") ? null : (c.dflt ?? null);
		const type = jsonColumns.has(`${c.tbl}.${c.name}`)
			? "json"
			: normalizeType(c.dataType, c.columnType);
		return {
			name: c.name,
			type,
			declaredType: c.columnType,
			enumValues: type === "enum" ? enumValues(c.columnType) : null,
			nullable: c.nullable === "YES",
			hasDefault:
				!view && (dflt !== null || autoIncrement || generated !== null),
			default: dflt,
			position: Number(c.pos) - 1,
			autoIncrement,
			generated,
			hidden: /\binvisible\b/i.test(extra),
			comment: c.comment ? c.comment : null,
		};
	}
}
