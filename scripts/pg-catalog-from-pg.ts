import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ViewNullability } from "../packages/pg/src/introspect/nullability.ts";

export interface PgClient {
	query<R extends readonly unknown[] = Record<string, unknown>[]>(
		text: string,
		values?: unknown[],
	): Promise<{ rows: R }>;
}

export const RELATIONS: readonly (readonly [
	schema: string,
	name: string,
	description: string,
])[] = [
	["pg_catalog", "pg_am", "Access methods."],
	["pg_catalog", "pg_attrdef", "Column default expressions."],
	["pg_catalog", "pg_attribute", "Table columns."],
	[
		"pg_catalog",
		"pg_class",
		"Tables, indexes, sequences, views and other relations.",
	],
	[
		"pg_catalog",
		"pg_constraint",
		"Check, primary key, unique, foreign key and exclusion constraints.",
	],
	["pg_catalog", "pg_database", "Databases of the cluster."],
	["pg_catalog", "pg_depend", "Dependencies between database objects."],
	["pg_catalog", "pg_description", "Comments on database objects."],
	["pg_catalog", "pg_enum", "Enum labels."],
	["pg_catalog", "pg_extension", "Installed extensions."],
	["pg_catalog", "pg_index", "Index details (the rest is in pg_class)."],
	["pg_catalog", "pg_inherits", "Table inheritance and partitions."],
	["pg_catalog", "pg_namespace", "Schemas."],
	["pg_catalog", "pg_proc", "Functions and procedures."],
	["pg_catalog", "pg_sequence", "Sequence parameters."],
	["pg_catalog", "pg_trigger", "Triggers."],
	["pg_catalog", "pg_type", "Data types."],
	[
		"pg_catalog",
		"pg_available_extensions",
		"Extensions available for installation.",
	],
	["pg_catalog", "pg_indexes", "Indexes, with their definitions."],
	["pg_catalog", "pg_locks", "Locks held and awaited by active processes."],
	["pg_catalog", "pg_matviews", "Materialized views."],
	["pg_catalog", "pg_replication_slots", "Replication slots."],
	["pg_catalog", "pg_roles", "Database roles (pg_authid without passwords)."],
	["pg_catalog", "pg_sequences", "Sequences, with their current state."],
	["pg_catalog", "pg_settings", "Run-time configuration parameters."],
	[
		"pg_catalog",
		"pg_stat_activity",
		"One row per server process: current activity.",
	],
	["pg_catalog", "pg_stat_all_indexes", "Per-index access statistics."],
	["pg_catalog", "pg_stat_all_tables", "Per-table access statistics."],
	[
		"pg_catalog",
		"pg_stat_database",
		"Per-database statistics (plus a row with datid 0 for shared objects).",
	],
	["pg_catalog", "pg_stat_replication", "One row per WAL sender process."],
	[
		"pg_catalog",
		"pg_stat_user_indexes",
		"pg_stat_all_indexes for user indexes.",
	],
	["pg_catalog", "pg_stat_user_tables", "pg_stat_all_tables for user tables."],
	[
		"pg_catalog",
		"pg_statio_user_tables",
		"Per-table I/O statistics for user tables.",
	],
	["pg_catalog", "pg_tables", "Ordinary and partitioned tables."],
	["pg_catalog", "pg_views", "Views, with their definitions."],
	["information_schema", "check_constraints", "Check constraints."],
	["information_schema", "columns", "Columns of tables and views."],
	[
		"information_schema",
		"constraint_column_usage",
		"Columns used by constraints.",
	],
	["information_schema", "domains", "Domains."],
	[
		"information_schema",
		"key_column_usage",
		"Columns of unique, primary key and foreign key constraints.",
	],
	["information_schema", "parameters", "Function parameters."],
	["information_schema", "referential_constraints", "Foreign key constraints."],
	["information_schema", "routines", "Functions and procedures."],
	[
		"information_schema",
		"schemata",
		"Schemas the current user owns or can use.",
	],
	["information_schema", "sequences", "Sequences."],
	["information_schema", "table_constraints", "Table constraints."],
	["information_schema", "tables", "Tables and views."],
	["information_schema", "triggers", "Triggers."],
	["information_schema", "views", "Views."],
];

export const FUNCTION_COLUMNS_NOT_NULL = new Set([
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
	client: PgClient,
	relid: string,
): Promise<{ name: string; type: string; notnull: boolean }[]> {
	const { rows } = await client.query<
		{ name: string; notnull: boolean; typname: string; elem: string | null }[]
	>(
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

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string): string =>
	IDENT.test(name) ? name : JSON.stringify(name);

export async function generatePgCatalog(client: PgClient): Promise<string> {
	const views = new ViewNullability(
		(text, values) => client.query(text, values),
		{
			notNull: (view, column) =>
				FUNCTION_COLUMNS_NOT_NULL.has(`${view}.${column}`),
		},
	);
	const {
		rows: [{ version }],
	} = await client.query<[{ version: string }]>(
		`SELECT current_setting('server_version') AS version`,
	);

	const namespaces = new Map<string, string[]>();
	for (const [schema, name] of RELATIONS) {
		const { rows } = await client.query<{ oid: string; relkind: string }[]>(
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
			relkind === "v" ? await views.notNull(oid) : cols.map((c) => c.notnull);
		const body = cols.map(
			(c, i) =>
				`    ${key(c.name)}: ${notnull[i] ? "Col" : "Nullable"}<${JSON.stringify(c.type)}>;`,
		);

		const lines = [`  ${key(name)}: View<{`, ...body, "  }>;"];
		namespaces.set(schema, [...(namespaces.get(schema) ?? []), ...lines]);
	}
	return [
		`import type { Col, Nullable, View } from "./column.js";`,
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

export const OUTPUT = new URL(
	"../packages/core/src/postgres/schema/pg-catalog.ts",
	import.meta.url,
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const require = createRequire(
		new URL("../packages/core/package.json", import.meta.url),
	);
	const { Client } = require("pg") as {
		Client: new (config: {
			connectionString: string;
		}) => PgClient & { connect(): Promise<void>; end(): Promise<void> };
	};
	const url = process.env.TYPESQL_PG_URL;
	if (!url) {
		console.error(
			"set TYPESQL_PG_URL (e.g. docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=x postgres:18)",
		);
		process.exit(2);
	}
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		const source = await generatePgCatalog(client);
		if (process.argv.includes("--check")) {
			const current = readFileSync(OUTPUT, "utf8");
			if (current !== source) {
				console.error(
					`${fileURLToPath(OUTPUT)} is out of date; run without --check to regenerate`,
				);
				process.exitCode = 1;
			}
		} else {
			writeFileSync(OUTPUT, source);
			console.log(`wrote ${fileURLToPath(OUTPUT)}`);
		}
	} finally {
		await client.end();
	}
}
