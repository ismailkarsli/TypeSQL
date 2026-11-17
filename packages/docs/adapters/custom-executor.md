---
description: "Build TypeSQL queries without a client, run them on another client, or write your own executor."
---

# Custom executor

An executor is the function a query runs on. The adapters build one from your driver client, so most apps never need this page. It covers building queries without a client, running on another client, writing an executor, and changing the rows it returns.

## Build queries without a client

`createSql<DB>(postgresDialect)` from `@typesql/core` takes no client. Its queries are plain data, `{ text, values }` with the types attached, so you can run them however you like:

```ts
import { createSql } from "@typesql/core";
import { mapRows } from "@typesql/core/adapter";
import { postgresDialect } from "@typesql/core/postgres";
import pg from "pg";

const pool = new pg.Pool();
const sql = createSql<DB>(postgresDialect);

const q = sql(`SELECT id, email FROM users WHERE id = ${sql.param(7)}`);
q.text;
q.values;

const result = await pool.query(q.text, [...q.values]);
const rows = mapRows(q, result.rows);
```

`mapRows(q, rows)`, from `@typesql/core/adapter`, types the driver's rows as the query's rows and applies its [output plugins](../guide/plugins). The `exec*` methods of such a query reject unless you pass them an executor, and so does `sql.transaction`.

## Run on another client

Every `exec*` method takes an executor, which wins over the bound one. Each adapter exports `executor(client)` to build one from any client its `createSql` accepts. You can also bind a new `sql` to that client:

```ts
import { createSql, executor } from "@typesql/pg";

const client = await pool.connect();
try {
	await sql(
		`UPDATE users SET display_name = NULL WHERE id = ${sql.param(7)}`,
	).exec(executor(client));
	await createSql<DB>(client)(
		"DELETE FROM posts WHERE author_id = $1",
		7,
	).exec();
} finally {
	client.release();
}
```

## Write an executor

An executor is a function `(text, values)` that resolves to the rows, or to `{ rows, rowCount }`:

```ts
import type { Executor } from "@typesql/core";

const onPool: Executor = async (text, values) => {
	const result = await pool.query(text, [...values]);
	return { rows: result.rows, rowCount: result.rowCount };
};

const db = createSql<DB>(postgresDialect, onPool);
const users = await db("SELECT id FROM users").exec();
const changed = await db(
	`DELETE FROM posts WHERE author_id = ${db.param(7)}`,
).execCount();
```

- Return `{ rows, rowCount }` when the driver reports a row count. `execCount()` returns it. `rowCount: null` means the statement has no count (DDL, `BEGIN`), and `execCount()` returns 0.
- Return the rows alone when you have no count. Everything except `execCount()` works; `execCount()` rejects.
- Or give the executor a `count(text, values)` method that resolves to a number. `execCount()` then calls it instead. `@typesql/prisma` does this with `$executeRawUnsafe`.

A wrapper around an adapter's executor can return its result unchanged, so the count keeps working. For example, to log how long each query takes:

```ts
import { createSql as createCoreSql, type Executor } from "@typesql/core";
import { postgresDialect } from "@typesql/core/postgres";
import { executor, type PgTypeMap } from "@typesql/pg";

const onPool = executor(pool);
const logged: Executor = async (text, values) => {
	const started = performance.now();
	try {
		return await onPool(text, values);
	} finally {
		console.debug(`${Math.round(performance.now() - started)} ms`, text);
	}
};
const sqlLogged = createCoreSql<DB, PgTypeMap>(postgresDialect, logged);
```

## Change the rows

The row types describe what the driver returns, and `exec*` returns the executor's rows as they are (before applying TypeSQL plugins). So an executor that reshapes rows, for example one that keeps Kysely plugins or post-processes values, makes the types wrong.

Pick the narrowest fix:

1. **camelCase keys.** Use [`CasePlugin`](../guide/case-plugin) and keep the executor plain. With Kysely, use `@typesql/kysely`'s `createSql(postgresDialect, db).withPlugin(new CasePlugin())` or `executor(db)`, which bypass plugins, instead of an executor that runs `CamelCasePlugin`.
2. **Different value types** from your driver's parsers (say, `timestamptz` parsed to a string). Use a [type map](../reference/type-mapping#custom-type-maps) that says so: `createSql<DB, MyTypeMap>(postgresDialect, executor)`.
3. **Anything else.** Keep the executor plain and transform the rows in a typed helper built on `RowType<Q>`:

```ts
import type { Query, RowType } from "@typesql/core";

type WireValue<V> = V extends Date ? string : V;
type Wire<Row> = { [K in keyof Row]: WireValue<Row[K]> };
const toWire = (row: object) =>
	Object.fromEntries(
		Object.entries(row).map(([k, v]) => [
			k,
			v instanceof Date ? v.toISOString() : v,
		]),
	);

async function wire<Q extends Query<object>>(
	q: Q,
): Promise<Wire<RowType<Q>>[]> {
	return (await q.exec()).map(toWire) as Wire<RowType<Q>>[];
}

const payload = await wire(sql("SELECT id, created_at FROM users"));
```

::: warning Augmenting `QueryObject`
`Query` is a type alias. You can augment its `QueryObject` interface to change what `exec*` returns for every query in the program:

```ts
declare module "@typesql/core" {
  interface QueryObject<Row, Params extends readonly unknown[], Text extends string> {
    exec(executor?: Executor): Promise<Wire<Row>[]>;
    execTakeFirstOrNone(executor?: Executor): Promise<Wire<Row> | undefined>;
    execTakeFirst(executor?: Executor): Promise<Wire<Row>>;
  }
}
```

This is global and easy to get wrong. The type parameters must repeat core's exactly (names, constraints and defaults). The new signatures win only because TypeScript puts overloads from a later declaration first. `RowType<Q>` still describes the untransformed row. Prefer the fixes above. If you do augment, make sure the executor's transform and the declared type match.
:::

The full `Executor` type is in the [API reference](../reference/api#running-queries).
