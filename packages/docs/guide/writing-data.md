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

Also supported: multi-row `VALUES`, `DEFAULT` and `DEFAULT VALUES`, `INSERT … SELECT` (its
columns are checked against the target list), `OVERRIDING … VALUE`, and inserting into a view
is an error.

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
