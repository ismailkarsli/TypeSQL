import { DatabaseSync } from "node:sqlite";
import { createSql as createCoreSql } from "@typesql/core";
import { mysql } from "@typesql/core/mysql";
import { createSql } from "@typesql/pg";
import { createSql as createSqliteSql } from "@typesql/sqlite";
import { Pool } from "pg";

type DB = Record<string, never>;

// A name may contain `$` after its first character: `a$b$` and `x$1` are
// names, not a dollar quote or a parameter.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);

const named = sql("SELECT 1 AS a$b$, :y::int AS y", { y: 2 });
console.log(named.text, named.values);
export const namedRows = await named.execute();

// A dollar quote after an operator or a space is still one.
const quoted = sql(
	"SELECT $q$:z $1$q$ AS q, 5 =$$5$$::int AS eq, :w::int AS w",
	{ w: 6 },
);
console.log(quoted.text, quoted.values);
export const quotedRows = await quoted.execute();

const inline = sql.as<{ x$1: number; p: number }>(
	`SELECT 3 AS x$1, ${sql.param(4)}::int AS p`,
);
console.log(inline.text, inline.values);
export const inlineRows = await inline.execute();

console.log({ namedRows, quotedRows, inlineRows });
await pool.end();

// SQLite and MySQL names take `$` too.
const sqlite = createSqliteSql<DB>(new DatabaseSync(":memory:"));
const sqliteQuery = sqlite.as<{ x$1: number; p: number }>(
	`SELECT 3 AS x$1, ${sqlite.param(4)} AS p`,
);
console.log(sqliteQuery.text, sqliteQuery.values);
console.log(await sqliteQuery.executeTakeFirstOrThrow());

const my = createCoreSql<DB>(mysql);
const myQuery = my.as<{ x$1: number; p: number }>(
	`SELECT 3 AS x$1, ${my.param(4)} AS p`,
);
console.log(myQuery.text, myQuery.values);
