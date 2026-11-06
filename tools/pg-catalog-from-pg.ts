// Writes PgCatalog, the pg_catalog and information_schema relations a query can read,
// from a PostgreSQL server. usage: node tools/pg-catalog-from-pg.ts [--check]
import { columnSource, propertyKey as key } from "@typesql/core/adapter";
import { introspect } from "@typesql/pg/introspect";
import type pg from "pg";
import { emit, withPostgres } from "./generated.ts";

const RELATIONS: readonly (readonly [schema: string, name: string])[] = [
	["pg_catalog", "pg_am"],
	["pg_catalog", "pg_attrdef"],
	["pg_catalog", "pg_attribute"],
	["pg_catalog", "pg_class"],
	["pg_catalog", "pg_constraint"],
	["pg_catalog", "pg_database"],
	["pg_catalog", "pg_depend"],
	["pg_catalog", "pg_description"],
	["pg_catalog", "pg_enum"],
	["pg_catalog", "pg_extension"],
	["pg_catalog", "pg_index"],
	["pg_catalog", "pg_inherits"],
	["pg_catalog", "pg_namespace"],
	["pg_catalog", "pg_proc"],
	["pg_catalog", "pg_sequence"],
	["pg_catalog", "pg_trigger"],
	["pg_catalog", "pg_type"],
	["pg_catalog", "pg_available_extensions"],
	["pg_catalog", "pg_indexes"],
	["pg_catalog", "pg_locks"],
	["pg_catalog", "pg_matviews"],
	["pg_catalog", "pg_replication_slots"],
	["pg_catalog", "pg_roles"],
	["pg_catalog", "pg_sequences"],
	["pg_catalog", "pg_settings"],
	["pg_catalog", "pg_stat_activity"],
	["pg_catalog", "pg_stat_all_indexes"],
	["pg_catalog", "pg_stat_all_tables"],
	["pg_catalog", "pg_stat_database"],
	["pg_catalog", "pg_stat_replication"],
	["pg_catalog", "pg_stat_user_indexes"],
	["pg_catalog", "pg_stat_user_tables"],
	["pg_catalog", "pg_statio_user_tables"],
	["pg_catalog", "pg_tables"],
	["pg_catalog", "pg_views"],
	["information_schema", "check_constraints"],
	["information_schema", "columns"],
	["information_schema", "constraint_column_usage"],
	["information_schema", "domains"],
	["information_schema", "key_column_usage"],
	["information_schema", "parameters"],
	["information_schema", "referential_constraints"],
	["information_schema", "routines"],
	["information_schema", "schemata"],
	["information_schema", "sequences"],
	["information_schema", "table_constraints"],
	["information_schema", "tables"],
	["information_schema", "triggers"],
	["information_schema", "views"],
];

/** View columns from set-returning functions that never return NULL. */
const FUNCTION_COLUMNS_NOT_NULL = new Set([
	"pg_stat_activity.pid",
	"pg_stat_replication.pid",
	"pg_locks.locktype",
	"pg_locks.virtualtransaction",
	"pg_locks.mode",
	"pg_locks.granted",
	"pg_locks.fastpath",
	"pg_settings.name",
	"pg_settings.setting",
	"pg_settings.category",
	"pg_settings.short_desc",
	"pg_settings.context",
	"pg_settings.vartype",
	"pg_settings.source",
	"pg_settings.pending_restart",
	"pg_replication_slots.slot_name",
	"pg_replication_slots.slot_type",
	"pg_replication_slots.temporary",
	"pg_replication_slots.active",
	"pg_available_extensions.name",
]);

async function columnsOf(
	client: pg.Client,
	relid: string,
): Promise<{ name: string; type: string; notnull: boolean }[]> {
	const { rows } = await client.query<{
		name: string;
		notnull: boolean;
		typname: string;
		elem: string | null;
	}>(
		`SELECT a.attname AS name, a.attnotnull AS notnull,
            CASE WHEN t.typtype = 'd' THEN bt.typname ELSE t.typname END AS typname,
            CASE WHEN t.typtype = 'd' THEN bte.typname ELSE te.typname END AS elem
       FROM pg_attribute a
       JOIN pg_type t ON t.oid = a.atttypid
       LEFT JOIN pg_type bt ON bt.oid = t.typbasetype
       -- true arrays only: int2vector and oidvector have a typelem too, but are not its typarray
       LEFT JOIN pg_type te ON te.oid = t.typelem AND te.typarray = t.oid
       LEFT JOIN pg_type bte ON bte.oid = bt.typelem AND bte.typarray = bt.oid
      WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
		[relid],
	);
	return rows.map((r) => ({
		name: r.name,
		type: r.elem ? `${r.elem}[]` : r.typname,
		notnull: r.notnull,
	}));
}

async function generatePgCatalog(client: pg.Client): Promise<string> {
	// View columns are as nullable as @typesql/pg/introspect infers from their queries.
	const { version, relations } = await introspect(client, {
		schemas: Array.from(new Set(RELATIONS.map(([schema]) => schema))),
		viewNotNull: (view, column) =>
			FUNCTION_COLUMNS_NOT_NULL.has(`${view}.${column}`),
	});
	const viewNotNull = new Map(
		relations
			.filter((r) => r.kind === "view")
			.map((r) => [`${r.schema}.${r.name}`, r.columns.map((c) => !c.nullable)]),
	);

	const namespaces = new Map<string, string[]>();
	for (const [schema, name] of RELATIONS) {
		const { rows } = await client.query<{ oid: string; relkind: string }>(
			`SELECT c.oid::int8::text AS oid, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2`,
			[schema, name],
		);
		if (rows.length === 0)
			throw new Error(
				`relation ${schema}.${name} does not exist on Postgres ${version}`,
			);
		const { oid, relkind } = rows[0]!;
		const cols = await columnsOf(client, oid);
		const notnull =
			relkind === "v"
				? viewNotNull.get(`${schema}.${name}`)!
				: cols.map((c) => c.notnull);
		const body = cols.map(
			(c, i) =>
				`    ${key(c.name)}: ${columnSource(JSON.stringify(c.type), { nullable: !notnull[i] }, "postgres")};`,
		);

		const lines = [`  ${key(name)}: View<{`, ...body, "  }>;"];
		namespaces.set(schema, [...(namespaces.get(schema) ?? []), ...lines]);
	}
	return [
		`import type { Col, View } from "../../schema.js";`,
		"",
		"export interface PgCatalogNamespace {",
		...namespaces.get("pg_catalog")!,
		"}",
		"",
		"export interface InformationSchemaNamespace {",
		...namespaces.get("information_schema")!,
		"}",
		"",
		"export interface PgCatalog {",
		"  pg_catalog: PgCatalogNamespace;",
		"  information_schema: InformationSchemaNamespace;",
		"}",
		"",
	].join("\n");
}

const OUTPUT = new URL(
	"../packages/core/src/postgres/schema/pg-catalog.ts",
	import.meta.url,
);

emit(
	OUTPUT,
	await withPostgres(generatePgCatalog),
	`${RELATIONS.length} relations`,
);
