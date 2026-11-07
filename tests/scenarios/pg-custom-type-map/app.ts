import { createTransactionalSql } from "@typesql/core/adapter";
import { type Postgres, postgres } from "@typesql/core/postgres";
import {
	createSql,
	driver,
	type PgQueryable,
	type PgSql,
	type PgTypeMap,
} from "@typesql/pg";
import pg from "pg";

// The pool parses int8 to bigint and numeric to number, so its rows are typed
// with a type map that says so.
const types = new pg.TypeOverrides();
types.setTypeParser(pg.types.builtins.INT8, BigInt);
types.setTypeParser(pg.types.builtins.NUMERIC, Number);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, types });

interface ParsedTypeMap extends Omit<PgTypeMap, "int8" | "numeric"> {
	int8: bigint;
	numeric: number;
}

const query =
	"SELECT 9007199254740993::int8 AS big, 1.25::numeric AS decimal, NULL::int8 AS absent";

const sql: PgSql<{}, [], ParsedTypeMap> = createSql<{}, ParsedTypeMap>(pool);
export const parsed = await sql(query).execute();

// The driver builds the same API on createTransactionalSql.
const direct = createTransactionalSql<Postgres, {}, ParsedTypeMap, PgQueryable>(
	postgres,
	pool,
	driver,
);
export const fromDriver = await direct(query).execute();

// Without a type map, rows are typed with PgTypeMap, pg's defaults.
export const defaults = () => createSql<{}>(pool)(query).execute();

console.log({ parsed, fromDriver });
await pool.end();
