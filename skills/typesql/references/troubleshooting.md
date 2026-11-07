# Errors and limits

`SqlError<message, tokenIndex>` on the string is the real error, even when TypeScript prints `Argument of type 'string'`. Set `noErrorTruncation` for long messages. Fix it first; an invalid statement accepts any arguments.

| Error | Fix |
|---|---|
| `the SQL text is not a string literal` | `sql.param()`, `sql.id()`, a fragment, or `sql.as<Row>()` |
| `parameter $1: a … value cannot be used as …` | value doesn't fit the column or `Json<T>` |
| `an array for jsonb … must be passed as sql.json(value)`, `NonArrayOrSqlJson` | use `sql.json()` |
| `function f(text) does not exist` | declare it in `$functions` |
| `null value in column … violates not-null` | set the column, or flag `hasDefault` if it has a default |
| `DEFAULT is not allowed in this context` | `sql.optional` outside a `VALUES` item or `SET` value |
| `the SQL text has … tokens, more than the 4096 TypeSQL can check` | split the statement or `.ddl()` script, or use `sql.as<Row>()` |
| `TS2589`, `TS5114`, `TS5115` | compiler budget: split the statement, or use `sql.as<Row>()` |
| `TS2883` in a package exporting queries | add `@typesql/core` to its dependencies, or export rows |
| `TS1479` | ESM-only; not importable from `.cts` |

Unsupported syntax is always a compile error. Use `sql.as<Row>(text)`.

**Not caught at compile time:**
- A plain `string` fits an enum column; `any` and `unknown` aren't checked.
- `Json<T>` is trusted, and `DB` isn't compared with the real database.
- A fragment passed as a `string` value compiles, then throws.
