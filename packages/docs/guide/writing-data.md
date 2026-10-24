# Inserting and updating

`INSERT`, `UPDATE`, `DELETE` and `MERGE` are checked against your schema like queries. This page shows each one, plus helpers for optional values, partial updates and bulk inserts.

With `RETURNING`, a statement has a row type. Without it, the row type is `never`, and the adapters' `execute()` returns the number of affected rows.

## INSERT

Each value takes the column's type, with `| null` for nullable columns:

<<< @/snippets/writing-data.ts#insert

Every `NOT NULL` column without a default must be listed:

```ts
sql("INSERT INTO users (display_name) VALUES ($1)", "Ada");
// … SqlError<"null value in column \"email\" of relation \"users\" violates not-null constraint", 2>
```

Multi-row `VALUES`, `DEFAULT VALUES` and `INSERT … SELECT` work too; see [Supported SQL](../reference/sql#insert-update-delete-and-merge). `DEFAULT` is only allowed as a whole `VALUES` item or `SET` value, and not for a `NOT NULL` column without a default, because it would store `NULL`.

## UPDATE

`SET` columns must exist, and their values take the column types. `UPDATE … FROM` joins more tables, and `RETURNING` can use all of them:

<<< @/snippets/writing-data.ts#update

You can also assign an array element, a `jsonb` key or a field of a composite column (`SET tags[1] = $1`, `SET data['k'] = $1`). The value takes that element's or field's type.

## DELETE

<<< @/snippets/writing-data.ts#delete

`RETURNING *` expands to the target table's columns, or to every table in `FROM` / `USING`, as in Postgres.

## Upserts

`ON CONFLICT … DO NOTHING` and `DO UPDATE SET … WHERE …` are supported. `EXCLUDED` is the row that was proposed for insertion:

<<< @/snippets/writing-data.ts#upsert

## RETURNING old and new values

As in PostgreSQL 18, `RETURNING` can read the row before (`old`) and after (`new`) the change:

```ts
sql("UPDATE users SET email = $1 WHERE id = $2 RETURNING old.email AS was, new.email AS now", "a@b.c", 1);
// Row: { was: string; now: string }
```

- Rename them with `RETURNING WITH (OLD AS o, NEW AS n)`.
- `old` columns are nullable in an `INSERT`, because there is no old row.
- `new` columns are nullable in a `DELETE`.

## MERGE

`MERGE` is checked like the statements its actions look like. `UPDATE SET` and `INSERT` columns and values are checked, required columns must be set, and parameters take their columns' types:

```ts
sql(`MERGE INTO accounts a USING deltas d ON a.id = d.sid
     WHEN MATCHED THEN UPDATE SET balance = a.balance + d.delta
     WHEN NOT MATCHED THEN INSERT (id, balance) VALUES (d.sid, d.delta)
     RETURNING merge_action() AS action, a.id, new.balance`);
// Row: { action: string; id: number; balance: string }
```

- Each `WHEN` clause sees what Postgres lets it see: `NOT MATCHED` sees only the source, `NOT MATCHED BY SOURCE` only the target.
- `RETURNING` can use both tables, `merge_action()`, `old` and `new`. Source columns are nullable when a `NOT MATCHED BY SOURCE` action returns rows.

## Data-modifying CTEs

A statement with `RETURNING`, `MERGE` included, can feed a `WITH` clause:

<<< @/snippets/writing-data.ts#cte

## Optional values

A `sql.param(value)` whose value is `undefined` sends `DEFAULT` instead of a parameter. The column's default stays in the database, so you don't copy it into a `coalesce(…)`:

<<< @/snippets/writing-data.ts#optional-values

The value is checked like any parameter, without `undefined`. When it can be `undefined`, the statement is checked a second time with `DEFAULT` in its place. So such a value for a `NOT NULL` column without a default is an error, and so is one outside a `VALUES` item or `SET` value:

```ts
sql(`INSERT INTO users (email) VALUES (${sql.param(maybeEmail)})`);
// … SqlError<"null value in column \"email\" of relation \"users\" violates not-null constraint
//            (sql.param() sends DEFAULT for undefined)", 4>
sql(`SELECT id FROM users WHERE email = ${sql.param(maybeEmail)}`);
// … SqlError<"DEFAULT is not allowed in this context (sql.param() sends DEFAULT for undefined)", 7>
```

Narrow the value first, or pass `maybeEmail ?? null` to send `NULL`. `sql.fragment(…)` refuses a value that can be `undefined`: a fragment is checked where it is spliced, with `$n` for its values, so a `DEFAULT` there couldn't be checked. `any` and `unknown` values are not checked.

## Partial updates: `sql.set`

`sql.set(table, values)` builds a `SET` list from an object, such as a PATCH request body with optional keys. `undefined` values are skipped:

<<< @/snippets/writing-data.ts#set

- Keys must be columns of the table, and values must fit them: `null` only for nullable columns, enum values for enums.
- Keys that are not columns are errors, even on a variable whose type has extra keys, because they would be sent.
- Splice it into `UPDATE … SET {set}` or `ON CONFLICT … DO UPDATE SET {set}`. Other assignments can follow: `SET {set}, updated_at = now()`.

::: warning Empty input
If no value is defined at runtime, `sql.set` throws, because Postgres needs at least one assignment. Skip the `UPDATE` (or `SELECT` the row) when the input is empty.
:::

## Bulk inserts: `sql.values`

`sql.values(table, rows)` builds the column list and the `VALUES` rows from an array of objects:

<<< @/snippets/writing-data.ts#values

- `NOT NULL` columns without a default are required in every row. The others are optional.
- The columns are the keys that have a value in any row, in order of first use. A missing or `undefined` value is sent as `DEFAULT`, so rows with different keys can be mixed.
- A single row with no values becomes `DEFAULT VALUES`. An empty array throws, and so do several rows with no values.

The table name is only used for typing. Write tables in other schemas as `"schema.table"`: `sql.values("auth.sessions", rows)`.

### JSON columns

`sql.set` and `sql.values` send their values as parameters, so JSON values go through `sql.json(value)` there too. It is sent as JSON text by both drivers and checked against a [`Json<T>`](./schema#typed-json-columns) column:

<<< @/snippets/json.ts#write-helpers

A plain object also works as it is. An array without `sql.json()` is an error, because node-postgres would send it as a Postgres array.

For identity columns and other limits of these helpers, see [Limits](./limits).
