---
description: "Run TypeSQL on mysql2, the mariadb connector, PlanetScale or TiDB Cloud with @typesql/mysql, and how the mysql and mariadb dialects type schemas, functions, values, nullability and parameters."
---

# MySQL and MariaDB

`@typesql/mysql` runs queries on [mysql2](https://sidorares.github.io/node-mysql2/docs), the [mariadb](https://github.com/mariadb-corporation/mariadb-connector-nodejs) connector, or the serverless drivers of [PlanetScale](https://github.com/planetscale/database-js) and [TiDB Cloud](https://github.com/tidbcloud/serverless-js), and the `mysql` and `mariadb` dialects from `@typesql/core/mysql` type them with the rules of MySQL 8.4 and MariaDB 11.8. The two dialects share one parser and set of type rules, and differ where the servers do.

```sh
pnpm add @typesql/core @typesql/mysql mysql2
```

Install the driver you use instead of `mysql2`: `mariadb`, `@planetscale/database` or `@tidbcloud/serverless`. They are optional peer dependencies.

Use `mysql` for MySQL and the servers that speak its dialect: Amazon Aurora MySQL, Amazon RDS for MySQL, Google Cloud SQL, Azure Database for MySQL, PlanetScale (Vitess) and TiDB. Use `mariadb` for MariaDB and SkySQL.

## Run queries

Pass a `Pool`, `PoolConnection` or `Connection` from `mysql2/promise` to `createSql`:

```ts
import { createPool } from "mysql2/promise";
import { createSql } from "@typesql/mysql";

const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));
const posts = await sql(
  `SELECT id, title FROM posts WHERE author_id = ${sql.param(1)}`,
).execute();
```

- The adapter rewrites `$1`, `$2`, … to `?`, and mysql2 escapes the values into the statement (`query()`), so every statement works, `LIMIT $1` and DDL included.
- `sql.json(value)` is sent as JSON text and a `Uint8Array` as binary. mysql2 writes a `Date` in the time zone of its `timezone` option.
- On MariaDB, pass `{ dialect: "mariadb" }`, which checks statements against MariaDB's SQL (see [Differences between the servers](#differences-between-the-servers)): `createSql<DB>(pool, { dialect: "mariadb" })`.
- Attach [`CasePlugin`](../guide/case-plugin) for camelCase keys.

### The mariadb connector

```ts
import { createPool } from "mariadb";
import { createSql } from "@typesql/mysql/mariadb";

const sql = createSql<DB>(createPool(process.env["DATABASE_URL"]!));
```

It takes a `Pool`, `PoolConnection` or `Connection` of the connector's promise API. The dialect defaults to `mariadb` here; pass `{ dialect: "mysql" }` when the connector talks to MySQL.

### PlanetScale and TiDB Cloud

```ts
import { Client } from "@planetscale/database";
import { createSql } from "@typesql/mysql/planetscale";

const sql = createSql<DB>(new Client({ url: process.env["DATABASE_URL"] }));
```

```ts
import { connect } from "@tidbcloud/serverless";
import { createSql } from "@typesql/mysql/tidb";

const sql = createSql<DB>(connect({ url: process.env["DATABASE_URL"] }));
```

These HTTP drivers bind nothing on the server, so the adapter writes each value into the statement as an escaped literal (`Date`s in UTC). Both use the `mysql` dialect. Where TCP connections are available, mysql2 also connects to PlanetScale and TiDB.

### Prepared statements

With mysql2 and the mariadb connector, a query from [`sql.prepare`](../reference/api#sql-prepare-text) runs on the binary protocol (`execute()`): the driver prepares the statement once per connection and reuses it. Two differences from `query()`: `FLOAT` values arrive widened to double (`1.1` reads as `1.100000023841858`), and mysql2 before 3.24 sends numbers as `DOUBLE`, which MySQL rejects in `LIMIT ?`. The HTTP drivers have no prepared statements; `sql.prepare()` still assembles the SQL once.

## Schema

Columns use MySQL's type names in lower case and without lengths (`Col<"int">`, `Col<"varchar">`, `Col<"datetime", { nullable: true }>`), and integer types take ` unsigned` (`"bigint unsigned"`).

```ts
import type { Col, Enum } from "@typesql/core/mysql";

interface DB {
  users: {
    id: Col<"int unsigned", { autoIncrement: true }>;
    email: Col<"varchar">;
    display_name: Col<"varchar", { nullable: true }>;
    role: Enum<"admin" | "member", { hasDefault: true }>;
  };
}
```

The names are `tinyint`, `smallint`, `mediumint`, `int`, `bigint`, `decimal`, `float`, `double`, `bit`, `char`, `varchar`, `tinytext`, `text`, `mediumtext`, `longtext`, `binary`, `varbinary`, `tinyblob`, `blob`, `mediumblob`, `longblob`, `enum`, `set`, `date`, `datetime`, `timestamp`, `time`, `year`, `json`, the spatial types (`geometry`, `point`, …), MariaDB's `uuid`, `inet4` and `inet6`, and `vector`. `Enum<Values>` declares an `ENUM` column typed as its values.

### Column flags

| Flag | Effect |
|---|---|
| `nullable`, `hasDefault` | `NULL` allowed; optional in `INSERT` |
| `position` | column order, used by `SELECT *` and `INSERT … VALUES` without a column list |
| `autoIncrement` | an `AUTO_INCREMENT` column; implies `hasDefault` |
| `generated` | a `GENERATED ALWAYS AS` column: readable, but rejected in `INSERT` and `UPDATE`; implies `hasDefault` |
| `hidden` | an `INVISIBLE` column: usable by name, but not in `SELECT *` or `INSERT … VALUES` without a column list |

### Typed values

`Json<T>` types a JSON column's `->`, `->>` and `JSON_EXTRACT` with a constant path (`->>` unquotes, so its result is text), and `Typed<"varchar", T>` keeps a column's MySQL type and types its values as `T`.

```ts
import type { Col, Json, Typed } from "@typesql/core/mysql";

interface DB {
  posts: {
    meta: Json<{ tags: string[]; views: number }, { nullable: true }>;
    kind: Col<Typed<"varchar", "note" | "link">>;
  };
}

sql("SELECT meta -> '$.tags' AS tags, JSON_EXTRACT(meta, '$.views') AS views FROM posts");
// { tags: string[] | null; views: number | null }[]
```

## Generate the schema

`typesql introspect` reads a live database and writes its schema, with each column's type, nullability, default, position, `ENUM` values, `AUTO_INCREMENT`, and the generated and invisible columns:

```sh
pnpm add -D @typesql/cli mysql2
pnpm exec typesql introspect --url mysql://root@localhost/app --out src/db/schema.ts
```

```ts
// Generated by `typesql introspect` from MySQL 8.4. Do not edit.
import type { Col, Enum, View } from "@typesql/core/mysql";

export interface DB {
  /** View. */
  active_users: View<{
    id: Col<"int unsigned", { position: 0 }>;
    email: Col<"varchar", { position: 1 }>;
  }>;
  users: {
    id: Col<"int unsigned", { position: 0; autoIncrement: true }>;
    email: Col<"varchar", { position: 1 }>;
    role: Enum<"admin" | "member", { hasDefault: true; position: 2 }>;
    created_at: Col<"datetime", { hasDefault: true; position: 3 }>;
  };
}
```

The dialect is `mysql` for a `mysql://` URL and `mariadb` for a `mariadb://` URL; `--dialect mysql` or `--dialect mariadb` sets it for other URLs. The file is the same on both servers, and its first line names the one it was read from.

| Option | What it does |
|---|---|
| `--url <url>` | connection string, `mysql://user:password@host:port/database`; default `$DATABASE_URL` |
| `--database <name>` | the database to read; default the one in the URL |
| `--out <file>` | output file; default stdout |
| `--exclude <pattern>` | relation to leave out, where `*` matches anything; repeat it or comma-separate |
| `--type-name <name>` | name of the interface; default `DB` |
| `--import-from <module>` | where `Col`, `Enum` and `View` are imported from; default `@typesql/core/mysql` |
| `--no-comments` | leave out the JSDoc (comments, generated and invisible columns) |

The command connects with mysql2, or with the mariadb connector when mysql2 is not installed, and reads the tables and views of one database. On MariaDB, a `LONGTEXT` column with `CHECK (json_valid(…))` (what `JSON` creates) is `json`. From code, `@typesql/mysql/introspect` exports `introspect(client, { database, exclude })`, which takes a mysql2 or mariadb connection or pool, and `generateSource(result, { typeName, importFrom, comments })`.

## Types

Expressions get the type the server reports for them:

- Integer literals and integer arithmetic are `bigint` on MySQL. On MariaDB, short values are `int`. `count(*)` is `bigint` on both, which matters with the mariadb connector, which returns `BIGINT` as a JavaScript `bigint`.
- `/` is `decimal`, or `double` when an operand is a float or a string. `DIV` is an integer.
- Comparisons are `0` or `1`: `bigint` on MySQL, `int` on MariaDB.
- `CONCAT` and the other string functions are `varchar`, or `varbinary` when an argument is a binary string.
- `SUM` and `AVG` of integers and decimals are `decimal` (strings with mysql2).
- `CASE`, `IF`, `COALESCE` and `UNION` combine their types as the server does: integers widen, mixing signed and unsigned gives a wider signed type on MySQL and `decimal` on MariaDB, mixed numbers give `decimal` or `double`, and anything with a string gives a string.
- `@var` and `@@var` are `unknown`.

Each `createSql` types rows with the map of its driver, from `@typesql/core/mysql`:

| Driver | Type map |
|---|---|
| mysql2, on MySQL or MariaDB | `DefaultTypeMap` (`Mysql2MariaDbTypeMap` with `{ dialect: "mariadb" }`, the same map) |
| the mariadb connector | `MariaDbTypeMap` |
| PlanetScale, TiDB Cloud | `ServerlessTypeMap` |

mysql2 returns `DECIMAL` as a string and `BIGINT` as a number, which loses precision past 2^53. Pass the map that matches the pool's options as the second type argument: `createSql<DB, BigNumberStringsTypeMap>(pool)` for `supportBigNumbers` with `bigNumberStrings`, and `DateStringsTypeMap` for `dateStrings`. The mariadb connector returns `BIGINT` as `bigint`, and `createSql<DB>(mariadb)` from `@typesql/core` uses its map. The HTTP drivers return 64-bit integers, decimals and dates as strings. See [Type mapping](../reference/type-mapping#mysql-and-mariadb).

## Functions

The built-in functions are MySQL's and MariaDB's, each available on the server that has it. Declare stored functions and loadable functions (UDFs) under `$functions`:

```ts
import type { Sig } from "@typesql/core/mysql";

interface DB {
  $functions: {
    slugify: Sig<["varchar"], "varchar">;
    pick: [Sig<["int"], "int">, Sig<["varchar", "varchar"], "varchar">];
    join_all: Sig<["varchar", "..."], "varchar", { nullable: false }>;
    median: Sig<["double"], "double", { agg: true }>;
  };
}
```

- `Sig<Args, Ret, Flags>` lists the argument types and the return type. A trailing `"..."` repeats the last argument type, and an array of `Sig`s is an overload set, picked by the number of arguments.
- The result is `NULL` when an argument is `NULL`. Use `{ nullable: true }` for a function that can return `NULL` for any input, and `{ nullable: false }` for one that never does.
- `{ agg: true }` makes an aggregate (`GROUP BY` rules apply).
- Names are matched case-insensitively, and a declared function replaces a built-in of the same name.

## Nullability

- `LEFT` and `RIGHT JOIN` make the other side nullable. `WHERE x IS NOT NULL`, or a comparison on `x`, makes `x` non-null again, and a `WHERE` condition that rejects `NULL` in any column of the outer-joined table turns the join into an inner join for typing.
- `/`, `DIV` and `%` are nullable (division by zero) unless the divisor is a nonzero literal.
- Date functions (`DATE()`, `YEAR()`, …) are nullable for string arguments, since an invalid date gives `NULL`, and follow their argument for date and time arguments. `CAST(… AS DATE)`, `DATETIME` and `TIME` of anything but a date or time is nullable.
- An aggregate query without `GROUP BY` returns one row even for an empty table, so its aggregates are nullable, except `COUNT` and the `BIT_*` functions.
- `WITH ROLLUP` makes the grouped columns nullable.

MySQL's default `ONLY_FULL_GROUP_BY` is checked for queries that aggregate without `GROUP BY`: a bare column next to an aggregate is an error, as on MySQL. MariaDB allows it, and the column is nullable. With `GROUP BY`, columns that aren't functionally dependent on the grouped columns are not checked.

## Result columns

Row keys are the column names the server reports:

- A column reference is named as written: `SELECT ID FROM users` gives `ID`.
- An expression without `AS` is named by its text. On MySQL, a name keeps the whitespace after an expression that ends in an unqualified name, as MySQL does: `SELECT a + b FROM t` gives the key `"a + b "`. MariaDB trims it.
- A string literal is named by its value. `SELECT 'a' 'b'` gives `a` on MySQL and `ab` on MariaDB.
- A parameter is named `?`: `SELECT n + $1` gives `n + ?`, which is the name the server reports for a prepared statement.
- Duplicate names in a derived table, CTE or view are an error (`Duplicate column name`), as on the server.
- MySQL's `VALUES ROW(…)` names its columns `column_0`, `column_1`, …; MariaDB's `VALUES (…)` names them after the first row's values.

## Parameters

Use `$1`, `:name` or `${sql.param()}`; `?` is rejected with an error that says so, because fragments and inline values are numbered with `$n`. The adapters rewrite `$n` to `?` before the statement reaches the driver.

Parameters take their type from where they are used. Integer parameters accept `number | bigint` (`BIGINT` also a `string`), `DECIMAL` accepts `number | bigint | string`, date types accept `Date | string`, binary types accept `Uint8Array | string`, and a parameter without context accepts any value the drivers bind. `sql.json(value)` binds the value as JSON text.

## Statements

The SQL is MySQL's: names are quoted with backticks, `'…'` and `"…"` are strings with backslash escapes (`ANSI_QUOTES` is not supported), comments start with `#`, `--` followed by a space, or `/*`, and `X'…'`, `0x…`, `b'…'` and `_charset'…'` literals and `:=` work. Reserved words are those both servers reserve; a word only one of them reserves (MySQL's `rank`, `rows`, `window`) is accepted as a name.

- `SELECT` with `DISTINCT` / `DISTINCTROW` and modifiers (`SQL_CALC_FOUND_ROWS`, …); every join, including `STRAIGHT_JOIN`, `NATURAL`, `USING` and comma joins; derived tables (with their required alias and an optional column list), `LATERAL` and `JSON_TABLE`; index hints and `PARTITION`; `WHERE`, `GROUP BY … WITH ROLLUP`, `HAVING`, `WINDOW`, `ORDER BY`; `LIMIT n`, `LIMIT off, n` and `LIMIT n OFFSET m`; `FOR UPDATE`, `FOR SHARE` and `LOCK IN SHARE MODE`.
- `WITH [RECURSIVE]`, `UNION`, `INTERSECT` and `EXCEPT` (with `ALL` or `DISTINCT`), parenthesized query expressions, `VALUES ROW(…)` and `TABLE t` (MySQL), and `VALUES (…)` (MariaDB).
- `INSERT` and `REPLACE` with `VALUES`, `VALUE`, `SET` or a query, `IGNORE`, and `ON DUPLICATE KEY UPDATE` with `VALUES(col)` or a row alias (`AS new`, MySQL). `RETURNING` on MariaDB; on MySQL it is an error.
- `UPDATE`, including multi-table `UPDATE a JOIN b … SET`, and `ORDER BY` / `LIMIT` (single-table on MySQL).
- `DELETE` from one table (with `ORDER BY`, `LIMIT`, and `RETURNING` on MariaDB) or several (`DELETE t1 FROM …`, `DELETE FROM t1 USING …`).
- In migrations: `CREATE TABLE` (column attributes, table constraints and options, `LIKE`, `AS SELECT`), `ALTER TABLE` (`ADD`, `DROP`, `MODIFY`, `CHANGE` and `RENAME COLUMN`, `FIRST` / `AFTER`, `ALTER … SET` / `DROP DEFAULT`, `SET VISIBLE` / `INVISIBLE`, `RENAME TO`; index and constraint changes are accepted), `RENAME TABLE`, `DROP TABLE` / `VIEW`, `CREATE [OR REPLACE] VIEW`, `CREATE` / `DROP INDEX` and `TRUNCATE`. `SET`, `START TRANSACTION`, `LOCK TABLES` and similar statements are accepted without effect on the schema.

## Differences between the servers

Statements are checked against the server you pick:

| | MySQL | MariaDB |
|---|---|---|
| `RETURNING` | an error | `INSERT`, `REPLACE`, `DELETE` |
| `->`, `->>` | supported | an error |
| a bare column in an aggregate query without `GROUP BY` | an error (`ONLY_FULL_GROUP_BY`) | nullable |
| integer literals, comparisons | `bigint` | `int` for short values |
| signed mixed with unsigned | a wider signed type | `decimal` |
| `CAST(… AS JSON)`, `CAST(… AS YEAR)`, `LAG` / `LEAD` with a default | supported | an error |
| `VALUES ROW(…)`, `TABLE t`, `LATERAL`, `AS new` in `ON DUPLICATE KEY UPDATE` | supported | an error |
| a query that is `VALUES (…)` | an error | supported |
| functions | MySQL's (`ANY_VALUE`, `REGEXP_LIKE`, `UUID_TO_BIN`, …) | MariaDB's (`NVL`, `JSON_COMPACT`, `JSON_QUERY`, `SFORMAT`, `UUID_V4`, `NEXTVAL`, …) |
| result names | `'a' 'b'` is `a`; trailing whitespace kept | `ab`; trimmed |

Errors carry the server's own message (`Unknown column 'emial'. Perhaps you meant the column "email"?`, `Table 'x' doesn't exist`, `Field 'x' doesn't have a default value`, `Incorrect parameter count`).

## Transactions

`sql.transaction(fn)` works as [on every adapter](../guide/using-sql#transactions). It takes one connection from a pool for `BEGIN` … `COMMIT` and releases it afterwards, or runs on the connection you passed; a connection whose `ROLLBACK` fails is closed instead of returned to the pool. Nested calls use savepoints. On PlanetScale it uses the client's `transaction()`, and on TiDB Cloud the connection's `begin()`; both run on a session of their own.

## Migrations

A migration starts from `"mysql"` or `"mariadb"`, and the [migrator](../guide/migrations#the-migrator) connects from `url` with mysql2 (`mysql://` and `mariadb://` URLs, with the database in the URL):

```ts
import { createMigrator, migration } from "@typesql/core/migration";

export const createUsers = migration("mysql", {
	name: "create-users",
	up: async (db) =>
		db.ddl(`CREATE TABLE users (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			email VARCHAR(255) NOT NULL UNIQUE,
			role ENUM('admin', 'member') NOT NULL DEFAULT 'member'
		)`),
	down: async (db) => {
		await db.ddl("DROP TABLE users");
	},
});

await createMigrator({
	dialect: "mysql",
	url: process.env.DATABASE_URL,
	migrations: [createUsers],
}).latest();
```

Elsewhere pass `executor(connection)` from `@typesql/mysql` as `execute`, with one dedicated connection. The migrator holds a `GET_LOCK` named lock while it runs. MySQL and MariaDB commit DDL implicitly, so a migration that fails keeps the DDL that already ran, and the `MigrationError` reports `rolledBack: false` for it; a later migration has to repair it.

The schema a migration leaves follows MySQL's rules:

- Type aliases resolve to the type the server stores: `INTEGER` is `int`, `BOOL` and `BOOLEAN` are `tinyint`, `DEC`, `NUMERIC` and `FIXED` are `decimal`, `REAL`, `DOUBLE PRECISION` and `FLOAT(p)` with `p` over 24 are `double`, `CHARACTER VARYING` and `NVARCHAR` are `varchar`, and `LONG VARCHAR` is `mediumtext`.
- `SERIAL` is `bigint unsigned NOT NULL AUTO_INCREMENT`, and `PRIMARY KEY` columns are `NOT NULL`.
- `AUTO_INCREMENT`, `DEFAULT` and generated columns can be left out of an `INSERT`, and `ENUM('a', 'b')` columns are `Enum<"a" | "b">`.
- `CREATE TRIGGER`, `PROCEDURE`, `FUNCTION` and `EVENT` skip the rest of the text, so give each its own `.ddl()`.

## Limits

- Without `position` flags, `SELECT *` order is unspecified and `INSERT INTO t VALUES (…)` without a column list may type its values against the wrong columns, so name your columns or generate the schema.
- `sql()` on mysql2 and the mariadb connector, and every query on the HTTP drivers, write the values into the statement before the server sees it, so an unaliased expression with a parameter is named after its value (`n + 7`), not `n + ?`. Give such expressions an alias.
- A string literal that contains `\'` confuses `:name` rewriting and fragment interpolation. Write `''` instead.
- `/*! … */` executable comments are treated as comments.
- Table names are matched case-insensitively. MySQL on Linux compares them case-sensitively by default.
- Views are writable as far as TypeSQL is concerned, and `ONLY_FULL_GROUP_BY` doesn't check functional dependency on `GROUP BY` columns.
- On MariaDB, the integer width of some expressions is approximated (`CAST(… AS SIGNED)`, `MIN` of literals), so they can be `bigint` where the server says `int`.
- `SRID` attributes and `NOT NULL` on generated columns, which only MySQL accepts, are not checked in DDL.
- `sql.id`, `sql.set` and `sql.values` quote names with backticks, and `sql.values` writes `() VALUES ()` for a row with no values. A column left out of some rows is sent as `DEFAULT`.
