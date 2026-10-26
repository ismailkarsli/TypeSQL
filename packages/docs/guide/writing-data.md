# Inserting and updating

`INSERT`, `UPDATE`, `DELETE` and `MERGE` are checked against your schema like queries, and parameters take the types of the columns they are assigned to. This page covers what is checked, plus helpers for optional values, partial updates and bulk inserts.

<<< @/snippets/writing-data.ts#insert

With `RETURNING`, a statement has a row type. Without it, the row type is `never`, and the adapters' `execute()` returns the number of affected rows:

<<< @/snippets/writing-data.ts#update

## What is checked

- Target columns must exist, and values must fit their types, `null` only for nullable columns.
- Every `NOT NULL` column without a default must be set:

  ```ts
  sql("INSERT INTO users (display_name) VALUES ($1)", "Ada");
  // … SqlError<"null value in column \"email\" of relation \"users\" violates not-null constraint", 2>
  ```

- `DEFAULT` is only allowed as a whole `VALUES` item or `SET` value, and not for a `NOT NULL` column without a default.
- Assigning to an array element, a `jsonb` key or a composite field (`SET tags[1] = $1`) takes that element's or field's type.
- Writing to a view is an error: `cannot insert into view "v"`.
- `RETURNING *` expands as in Postgres: to the target table, or to every table in `FROM` / `USING`.
- `RETURNING old.*` and `new.*` (PostgreSQL 18): `old` columns are nullable in an `INSERT`, `new` columns in a `DELETE`.
- In `MERGE`, each `WHEN` clause sees only the tables Postgres lets it see, and its actions are checked like an `UPDATE` or `INSERT`. Source columns in `RETURNING` are nullable when a `NOT MATCHED BY SOURCE` action returns rows.

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
- Splice it into `UPDATE … SET {set}` or `ON CONFLICT … DO UPDATE SET {set}`. Other assignments can follow: `SET {set}, updated_at = now()`, for columns that are not keys of the input type (Postgres rejects a second assignment: `multiple assignments to same column "updated_at"`).

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
