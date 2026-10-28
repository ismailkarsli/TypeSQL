import { expectTypeOf, test } from "vitest";
import type {
	Col,
	DefaultTypeMap,
	PgCatalog,
	RowOf,
	SqlError,
	Validate,
} from "../../../src/index.js";
import { createSql } from "../../../src/index.js";

interface App {
	users: { id: Col<"int4">; email: Col<"text"> };
	/** A user relation shadows the catalog one of the same name. */
	pg_views: { id: Col<"int4"> };
}
type DB = App & PgCatalog;
type Row<S extends string> = RowOf<DB, DefaultTypeMap, S>;
type V<S extends string> = Validate<DB, S>;

test("the slice is opt-in: catalog relations are unknown without PgCatalog", () => {
	expectTypeOf<
		Validate<App, "SELECT pid FROM pg_stat_activity">
	>().toEqualTypeOf<
		SqlError<'relation "pg_stat_activity" does not exist', 3>
	>();
	expectTypeOf<
		Validate<App, "SELECT table_name FROM information_schema.tables">
	>().toEqualTypeOf<
		SqlError<'relation "information_schema.tables" does not exist', 3>
	>();
});

test("pg_catalog relations resolve unqualified and qualified", () => {
	expectTypeOf<
		Row<"SELECT pid, datname, state, backend_type, query_start FROM pg_stat_activity">
	>().toEqualTypeOf<{
		pid: number;
		datname: string | null;
		state: string | null;
		backend_type: string | null;
		query_start: Date | null;
	}>();
	expectTypeOf<
		Row<"SELECT a.pid FROM pg_catalog.pg_stat_activity a">
	>().toEqualTypeOf<{ pid: number }>();
	expectTypeOf<
		Row<"SELECT relname, relkind, reltuples, relacl, oid FROM pg_class">
	>().toEqualTypeOf<{
		relname: string;
		relkind: string;
		reltuples: number;
		relacl: string[] | null;
		oid: number;
	}>();
	expectTypeOf<
		Row<"SELECT backend_xid, client_addr FROM pg_stat_activity">
	>().toEqualTypeOf<{
		backend_xid: string | null;
		client_addr: string | null;
	}>();
});

test("schema relations win over pg_catalog; public. never falls back", () => {
	expectTypeOf<Row<"SELECT id FROM pg_views">>().toEqualTypeOf<{
		id: number;
	}>();
	expectTypeOf<
		Row<"SELECT viewname FROM pg_catalog.pg_views">
	>().toEqualTypeOf<{ viewname: string }>();
	expectTypeOf<V<"SELECT tablename FROM public.pg_tables">>().toEqualTypeOf<
		SqlError<'relation "public.pg_tables" does not exist', 3>
	>();
});

test("data statements: a catalog relation is a view, a namespace is not a table, qualified names stay qualified", () => {
	interface Ns extends PgCatalog {
		users: { id: Col<"int4"> };
		// a namespace inside a namespace: not something Postgres has, but a type can say it
		auth: { sessions: { id: Col<"uuid"> }; inner: { t: { id: Col<"int4"> } } };
	}
	type W<S extends string> = Validate<Ns, S>;
	expectTypeOf<W<"UPDATE pg_class SET relname = 'x'">>().toEqualTypeOf<
		SqlError<'cannot update view "pg_catalog.pg_class"', 0>
	>();
	expectTypeOf<W<"UPDATE nope SET x = 1">>().toEqualTypeOf<
		SqlError<'relation "nope" does not exist', 1>
	>();
	// without the slice, the catalog relation is unknown
	expectTypeOf<
		Validate<App, "UPDATE pg_class SET relname = 'x'">
	>().toEqualTypeOf<SqlError<'relation "pg_class" does not exist', 1>>();
	expectTypeOf<W<"UPDATE auth SET x = 1">>().toEqualTypeOf<
		SqlError<'"auth" is not a table', 1>
	>();
	expectTypeOf<W<"SELECT * FROM auth">>().toEqualTypeOf<
		SqlError<'"auth" is not a table', 3>
	>();
	expectTypeOf<W<"UPDATE auth.inner SET id = 1">>().toEqualTypeOf<
		SqlError<'"auth.inner" is not a table', 1>
	>();
	expectTypeOf<W<"UPDATE public.nope SET x = 1">>().toEqualTypeOf<
		SqlError<'relation "public.nope" does not exist', 1>
	>();
	expectTypeOf<W<"UPDATE nope.t SET x = 1">>().toEqualTypeOf<
		SqlError<'relation "nope.t" does not exist', 1>
	>();
	expectTypeOf<W<"UPDATE auth.nope SET x = 1">>().toEqualTypeOf<
		SqlError<'relation "auth.nope" does not exist', 1>
	>();
	expectTypeOf<W<"SELECT * FROM public.nope">>().toEqualTypeOf<
		SqlError<'relation "public.nope" does not exist', 3>
	>();
});

test("information_schema needs its prefix; domains are their base types", () => {
	expectTypeOf<
		Row<"SELECT table_schema, table_name, table_type FROM information_schema.tables">
	>().toEqualTypeOf<{
		table_schema: string;
		table_name: string;
		table_type: string | null;
	}>();
	expectTypeOf<
		Row<"SELECT column_name, ordinal_position, is_nullable, data_type, character_maximum_length FROM information_schema.columns">
	>().toEqualTypeOf<{
		column_name: string;
		ordinal_position: number;
		is_nullable: string;
		data_type: string;
		character_maximum_length: number | null;
	}>();
	expectTypeOf<V<"SELECT table_name FROM tables">>().toEqualTypeOf<
		SqlError<'relation "tables" does not exist', 3>
	>();
});

test("catalog relations are read-only", () => {
	expectTypeOf<
		V<"UPDATE pg_settings SET setting = 'x' WHERE name = 'work_mem'">
	>().toEqualTypeOf<
		SqlError<'cannot update view "pg_catalog.pg_settings"', 0>
	>();
	expectTypeOf<V<"DELETE FROM pg_catalog.pg_class">>().toEqualTypeOf<
		SqlError<'cannot delete from view "pg_catalog.pg_class"', 2>
	>();
});

test("Magnus's database-stats queries", () => {
	const sql = createSql<DB>();
	const activity = sql(`
    SELECT
      MAX(EXTRACT(EPOCH FROM (now() - query_start)))::float8 AS longest_seconds,
      COUNT(*) FILTER (WHERE now() - query_start > interval '5 seconds')::int AS long_running
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state = 'active'
      AND backend_type IN ('client backend', 'standalone backend')
      AND pid <> pg_backend_pid()
  `);
	expectTypeOf(activity.execute).returns.resolves.toEqualTypeOf<
		{ longest_seconds: number | null; long_running: number }[]
	>();

	const connections = sql(`
    SELECT state, count(*)::int AS total
    FROM pg_stat_activity
    WHERE backend_type IN ('client backend', 'standalone backend')
    GROUP BY state
  `);
	expectTypeOf(connections.execute).returns.resolves.toEqualTypeOf<
		{ state: string | null; total: number }[]
	>();

	const database = sql(`
    SELECT
      current_setting('max_connections')::int AS max_connections,
      pg_database_size(current_database())::bigint AS size_bytes,
      (blks_hit::float8 / NULLIF(blks_hit + blks_read, 0)) AS cache_hit_ratio,
      xact_commit, xact_rollback, deadlocks, temp_files, temp_bytes, stats_reset
    FROM pg_stat_database
    WHERE datname = current_database()
  `);
	expectTypeOf(database.execute).returns.resolves.toEqualTypeOf<
		{
			max_connections: number;
			size_bytes: string;
			cache_hit_ratio: number | null;
			xact_commit: string;
			xact_rollback: string;
			deadlocks: string;
			temp_files: string;
			temp_bytes: string;
			stats_reset: Date | null;
		}[]
	>();

	const tables = sql(`
    SELECT tablename AS name,
           pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass)::bigint AS bytes
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY 2 DESC
    LIMIT 10
  `);
	expectTypeOf(tables.execute).returns.resolves.toEqualTypeOf<
		{ name: string; bytes: string }[]
	>();

	const terminate = sql(
		"SELECT pg_terminate_backend(pid) AS ok FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
		"db",
	);
	expectTypeOf(terminate.execute).returns.resolves.toEqualTypeOf<
		{ ok: boolean }[]
	>();
});
