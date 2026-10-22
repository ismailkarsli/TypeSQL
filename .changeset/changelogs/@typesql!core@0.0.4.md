## 0.0.4

### Patch Changes

- A statement that fails to validate reports only its SqlError on the SQL text, instead of an argument-count error such as "Expected 2 arguments, but got 3".

- An opt-in `PgCatalog` slice types queries on `pg_stat_activity`, `pg_stat_database`, `pg_tables`, `pg_class`, `information_schema.columns` and other system catalogs: `createSql<DB & PgCatalog>()`.

- Queries have `executeCount()`, which resolves to the affected row count: an `Executor` may resolve to `{ rows, rowCount }` instead of the rows, as the `executor()` of `@typesql/pg`, `@typesql/postgres` and `@typesql/kysely` now do.

- Declare typed JSON columns with `Json<T>`: rows read `T`, `->` / `#>` index into it, parameters take `T`, and `sql.json(value)` sends JSON the same way with pg and postgres.js, inline, as a `sql.set` / `sql.values` value or as a positional or named argument; a raw array for a json / jsonb parameter (through `sql.param()`, `sql.set`, `sql.values` or as an argument) is now a compile error.

- Compile errors on long statements show the SqlError message first (`SqlError<…> & "…SQL…"`), so it is no longer cut off when TypeScript truncates the statement text in the diagnostic.

- `createSql(executor, { rowKeys: "camelCase" })` (and the adapters' `createSql(client, { rowKeys: "camelCase" })`) camelCases the top-level row keys the way Kysely's `CamelCasePlugin` does, in the row types and in the rows `execute*` and the `query`/`one`/`maybeOne`/`many` helpers return, leaving JSON values untouched.

- A table alias used as a value is a whole-row reference: `to_json(t)`, `json_agg(t)`, `row_to_json(t.*)` and `t IS NULL` no longer fail with "column does not exist", and `(t).col` / `(t).*` read its columns.

- `sql.id(name)` with a generic name constrained to `RelationName<DB>` is typed as every table and view instead of failing, other non-literal names give the usual "dynamic SQL fragment" error, and a fragment whose text is a union now reports an error in any member instead of passing when one member is valid.

- Type checking is about 7% faster: the lexer handles punctuation, `=`, `::` and `.` without trying every operator, cutting its type instantiations by about 20%.

- Calling an unknown function is a compile error (`function f(text) does not exist`, with a "Perhaps you meant" hint); declare app and extension functions under `$functions` in the schema or in `FunctionCatalog`, `CREATE FUNCTION` in migrations registers them, and every other `pg_catalog` function is known with its return type.

- Add write helpers: `sql.valueOrDefault(x)` sends `DEFAULT` when `x` is `undefined`, and `sql.set(table, partial)` / `sql.values(table, rows)` build typed `SET` lists and `VALUES` rows from objects. `DEFAULT` outside a `VALUES` item or `SET` value, or for a `NOT NULL` column without a default, is now a compile error.

- Add `sql.list(items, separator)`: join a runtime array of fragments with known texts (such as user-chosen `ORDER BY` keys) and keep the statement checked, without `sql.as`.

- JSON built in SQL is typed: `json_build_object`, `json_build_array`, `json_agg`, `json_object_agg` and `to_json(t)` give the JSON's structure (values typed as Postgres serializes them, so timestamps are strings), `->`, `#>` and subscripts follow it, and JSON aggregates in a grouped query are no longer nullable.

- Parameters accept `null` wherever Postgres does: comparisons (`col = $1`, `IN`, `ANY`, `LIKE`), `LIMIT`/`OFFSET`, casts in comparisons and function arguments (`coalesce($1::text, 'x')`), and array elements (`(number | null)[]`); assigning `null` to a `NOT NULL` column is still an error.

- Parameters accept what the driver can serialize on top of the row type (`int8`, `numeric` and `money` take `number | bigint | string`, dates and timestamps take `Date | string`), also when a type map types those rows differently; a type map can declare its own input types under `$params`.
