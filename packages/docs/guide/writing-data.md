# Writing data

`INSERT`, `UPDATE` and `DELETE` are checked against the schema like queries. With
`RETURNING`, they have a row type; without it the row type is `never`, and adapters'
`execute()` returns the affected row count.

## INSERT

Value parameters take the column's type, including `| null` for nullable columns. Every
`NOT NULL` column without a default must be listed:

<<< @/snippets/writing-data.ts#insert

```ts
sql("INSERT INTO users (display_name) VALUES ($1)", "Ada");
// … SqlError<"null value in column \"email\" of relation \"users\" violates not-null constraint", 2>
```

JSON values for `json` / `jsonb` columns go through `${sql.json(value)}`, which sends JSON text
with any driver and checks the value against a [`Json<T>`](./schema#typed-json-columns) column.

Also supported: multi-row `VALUES`, `DEFAULT` and `DEFAULT VALUES`, `INSERT … SELECT` (its
columns are checked against the target list), `OVERRIDING … VALUE`, and inserting into a view
is an error. `DEFAULT` is only allowed as a whole `VALUES` item or `SET` value, and not for a
`NOT NULL` column without a default (it would store `NULL`).

## Optional values: `sql.valueOrDefault`

`sql.valueOrDefault(value)` is used like `sql.param(value)`, but an `undefined` value sends
`DEFAULT` instead of a parameter. The column's default stays in the database, so you don't
copy it into a `coalesce(…)`:

<<< @/snippets/writing-data.ts#value-or-default

The value is checked like a parameter, without `undefined`. When it can be `undefined`, the
statement is checked a second time with `DEFAULT` in its place, so using it outside a `VALUES`
item or `SET` value, or for a `NOT NULL` column without a default, is an error:

```ts
sql(`INSERT INTO users (email) VALUES (${sql.valueOrDefault(maybeEmail)})`);
// … SqlError<"null value in column \"email\" of relation \"users\" violates not-null constraint
//            (sql.valueOrDefault() sends DEFAULT for undefined)", 4>
```

The second check runs once per statement, however many `valueOrDefault` values it has. Inside
`sql.fragment(…)` only the value type is checked.

## Partial updates: `sql.set`

`sql.set(table, values)` builds a `SET` list from an object, such as a PATCH body with
optional keys. Keys must be columns of the table and values must fit them (`null` only for
nullable columns, enum values for enums). `undefined` values are skipped:

<<< @/snippets/writing-data.ts#set

- Splice it into `UPDATE … SET {set}` or `ON CONFLICT … DO UPDATE SET {set}`; other
  assignments can follow (`SET {set}, updated_at = now()`).
- The statement is checked with every key of the input type assigned once, so the columns are
  checked again against the table being updated.
- Keys that are not columns are errors, also on a variable whose type has extra keys, because
  they would be sent.
- If no value is defined at runtime, `sql.set` throws: Postgres needs at least one assignment.
  Skip the `UPDATE` (or `SELECT` the row) when the input is empty.

## Bulk inserts: `sql.values`

`sql.values(table, rows)` builds the column list and the `VALUES` rows from objects:

<<< @/snippets/writing-data.ts#values

- `NOT NULL` columns without a default are required in every row; the others are optional.
- The columns are the keys that have a value in any row, in order of first appearance. A
  missing or `undefined` value is `DEFAULT`, so rows with different keys can be mixed.
- One row without any value becomes `DEFAULT VALUES`. An empty array throws, and so do
  several rows without values (Postgres cannot insert them with `VALUES`).
- The statement is checked with every key of the row types once.

The table name is only used for typing, and schema tables are written `"schema.table"`:
`sql.values("auth.sessions", rows)`.

## UPDATE

`SET` columns must exist and values take their types. `UPDATE … FROM` joins more tables, and
`RETURNING` can use all of them:

<<< @/snippets/writing-data.ts#update

## Upserts

`ON CONFLICT … DO NOTHING` and `DO UPDATE SET … WHERE …` are supported; `EXCLUDED` refers to
the row that was proposed for insertion:

<<< @/snippets/writing-data.ts#upsert

## DELETE

<<< @/snippets/writing-data.ts#delete

`RETURNING *` expands to the target table's columns, or to every table in `FROM`/`USING`, as
in Postgres.

## Data-modifying CTEs

Statements with `RETURNING` can feed a `WITH` clause:

<<< @/snippets/writing-data.ts#cte
